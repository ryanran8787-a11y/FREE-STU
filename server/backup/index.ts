// 全庫備份深模組：SQLite 快照 + 音檔 + 打包，全部收在這裡。
//
// 對外只開一個口：createBackup() → { name, buf, fileCount }。
// router 只負責把 Buffer 變成下載回應。
//
// 快照用 VACUUM INTO 而不是複製檔案：前者拿的是寫入一致性的副本（進行中的寫入不會出現半套），
// 而且順便壓實了檔案，常能省下大量空間。音檔（mp3）直接從磁碟夾進去——
// 備份的意義是「換機器也能完整還原」，音檔在外面就是還原不完整。

import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { zipFiles } from "./zip";

export type BackupResult = { name: string; buf: Buffer; fileCount: number };

/** DATABASE_URL → 絕對路徑（file:A:/x/y.db → A:/x/y.db）。 */
export function dbPathFromUrl(url: string): string {
  const m = /^file:(.+)/.exec(url);
  if (!m) throw new Error(`無法辨識的 DATABASE_URL：${url}`);
  let p = m[1].replace(/\?[^]*$/, "");
  // Windows 上的 file:/C:/... 形態
  if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
  return p;
}

/** VACUUM INTO 的目標路徑：與資料庫同目錄的暫存檔，用完即刪。 */
function snapshotPath(): string {
  return path.join(
    path.dirname(dbPathFromUrl(process.env.DATABASE_URL!)),
    `.backup-snapshot-${process.pid}-${Date.now()}.db`,
  );
}

export async function createBackup(): Promise<BackupResult> {
  // 1) SQLite 一致性快照（VACUUM INTO 不接受參數綁定；路徑由 snapshotPath() 自己組成，
  //    只含 pid/時間戳，無注入面；單引號仍依 SQL 慣例逃逸）
  const snap = snapshotPath();
  await fs.rm(snap, { force: true });
  try {
    await db.$executeRawUnsafe(`VACUUM INTO '${snap.replace(/'/g, "''")}'`);
    const snapBuf = await fs.readFile(snap);

    // 2) 蒐集音檔（目錄不存在 = 還沒做過播客，不擋備份）
    const entries: { name: string; data: Buffer }[] = [{ name: "database.db", data: snapBuf }];
    const podDir = path.join(process.cwd(), "data", "podcasts");
    let files: string[] = [];
    try {
      files = (await fs.readdir(podDir)).filter((f) => f.toLowerCase().endsWith(".mp3"));
    } catch {
      /* 空目錄 */
    }
    for (const f of files) {
      entries.push({ name: `podcasts/${f}`, data: await fs.readFile(path.join(podDir, f)) });
    }

    // 3) 打包
    const buf = zipFiles(entries);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const name = `free-stu-backup-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.zip`;
    return { name, buf, fileCount: entries.length };
  } finally {
    await fs.rm(snap, { force: true }).catch(() => undefined);
  }
}
