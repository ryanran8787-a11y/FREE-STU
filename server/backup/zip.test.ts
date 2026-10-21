import { execFileSync } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterAll, describe, expect, it } from "vitest";
import { zipFiles } from "./zip";

/**
 * 用系統工具真實解壓驗證（零 npm 依賴）。zip 不是核心功能，這條只當「有工具就順手驗」：
 * - Windows 的 tar 是 libarchive，支援 zip；
 * - Linux 的 GNU tar 不支援 zip（"This does not look like a tar archive"），改用 unzip 或 python3。
 * 全部不可用時回 null，呼叫端 skip —— 不讓「機器沒裝解壓工具」變成 CI 紅燈。
 */
function unzipWithSystemTool(zipPath: string, outDir: string): boolean {
  const candidates: [string, string[]][] =
    process.platform === "win32"
      ? [["tar", ["-xf", zipPath, "-C", outDir]]]
      : [
          ["unzip", ["-q", "-o", zipPath, "-d", outDir]],
          ["python3", ["-m", "zipfile", "-e", zipPath, outDir]],
        ];
  for (const [cmd, args] of candidates) {
    try {
      execFileSync(cmd, args, { stdio: "pipe" });
      return true;
    } catch {
      // 換下一個工具
    }
  }
  return false;
}

async function unzipTo(buf: Buffer, intoDir: string): Promise<string[] | null> {
  const zipPath = path.join(intoDir, "test.zip");
  await fs.writeFile(zipPath, buf);
  const outDir = path.join(intoDir, "out");
  await fs.mkdir(outDir, { recursive: true });
  if (!unzipWithSystemTool(zipPath, outDir)) return null;
  const files: string[] = [];
  async function walk(dir: string, prefix: string) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) await walk(path.join(dir, e.name), `${prefix}${e.name}/`);
      else files.push(`${prefix}${e.name}`);
    }
  }
  await walk(outDir, "");
  return files;
}

const tmp = path.join(os.tmpdir(), `hs-hsa-zip-test-${process.pid}`);

describe("zipFiles", () => {
  const entries = (mtime: Date) => [
    { name: "database.db", data: Buffer.from("db-bytes-0123456789"), mtime },
    { name: "podcasts/gen-abc.mp3", data: Buffer.from("ID3 fake mp3 payload"), mtime },
  ];

  it("單一檔案：EOCD 簽名與條目數正確", async () => {
    const buf = zipFiles([{ name: "a.txt", data: Buffer.from("hello world") }]);
    // EOCD 固定 22 bytes 在結尾：簽名 PK\x05\x06
    expect(buf.subarray(buf.length - 22, buf.length - 18).toString("ascii")).toBe("PK\x05\x06");
    const entryCount = buf.readUInt16LE(buf.length - 22 + 10);
    expect(entryCount).toBe(1);
  });

  it("多檔案＋子目錄條目數正確", () => {
    const buf = zipFiles(entries(new Date()));
    const entryCount = buf.readUInt16LE(buf.length - 22 + 10);
    expect(entryCount).toBe(2);
  });

  it("真實解壓：系統工具能解開且內容一致", async (ctx) => {
    await fs.mkdir(tmp, { recursive: true });
    const fixedDate = new Date("2026-10-18T15:30:00Z");
    const buf = zipFiles(entries(fixedDate));
    const files = await unzipTo(buf, tmp);
    if (files === null) {
      // 這台機器沒有能解 zip 的工具（如 GNU tar + 無 unzip/python3）：跳過，不算失敗。
      ctx.skip("沒有可用的解壓工具，略過真實解壓驗證");
      return;
    }
    expect(files.sort()).toEqual(["database.db", "podcasts/gen-abc.mp3"]);
    const db = await fs.readFile(path.join(tmp, "out", "database.db"), "utf-8");
    expect(db).toBe("db-bytes-0123456789");
    const mp3 = await fs.readFile(path.join(tmp, "out", "podcasts", "gen-abc.mp3"), "utf-8");
    expect(mp3).toBe("ID3 fake mp3 payload");
  }, 30000);

  it("空資料與二進位資料都能打包", async () => {
    const binary = Buffer.from([0, 1, 2, 255, 254, 0xff]);
    const buf = zipFiles([
      { name: "empty.bin", data: Buffer.alloc(0) },
      { name: "bin.bin", data: binary },
    ]);
    const entryCount = buf.readUInt16LE(buf.length - 22 + 10);
    expect(entryCount).toBe(2);
  });

  it("非 ASCII 檔名被拒絕（備份檔名自己控制）", () => {
    expect(() => zipFiles([{ name: "資料庫.db", data: Buffer.from("x") }])).toThrow(/ASCII/);
  });

  it("DOS 時間轉換：1980 之前鉗制", () => {
    const buf = zipFiles([{ name: "old.txt", data: Buffer.from("x"), mtime: new Date("1970-01-01T00:00:00Z") }]);
    // local header: sig(4) ver(2) flags(2) method(2) time(2) date(2) → date 在 offset 12
    const date = buf.readUInt16LE(12);
    expect(date).toBe(33);
  });
});

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});
