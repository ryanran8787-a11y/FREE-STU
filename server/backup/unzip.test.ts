import { describe, expect, it } from "vitest";
import { zipFiles } from "./zip";
import { unzipStore } from "./unzip";

describe("unzipStore", () => {
  it("zipFiles → unzipStore 往返一致", () => {
    const buf = zipFiles([
      { name: "database.db", data: Buffer.from("db-bytes-0123456789") },
      { name: "podcasts/gen-abc.mp3", data: Buffer.from("ID3 fake mp3 payload") },
      { name: "empty.bin", data: Buffer.alloc(0) },
    ]);
    const out = unzipStore(buf);
    expect(out.map((e) => e.name).sort()).toEqual(["database.db", "empty.bin", "podcasts/gen-abc.mp3"]);
    expect(out.find((e) => e.name === "database.db")!.data.toString()).toBe("db-bytes-0123456789");
    expect(out.find((e) => e.name === "podcasts/gen-abc.mp3")!.data.toString()).toBe("ID3 fake mp3 payload");
    expect(out.find((e) => e.name === "empty.bin")!.data.length).toBe(0);
  });

  it("空 zip / 非 zip 被拒絕", () => {
    expect(() => unzipStore(Buffer.from("not a zip at all"))).toThrow();
    expect(() => unzipStore(Buffer.alloc(0))).toThrow();
  });

  it("截斷的 zip 被拒絕", () => {
    const buf = zipFiles([{ name: "a.txt", data: Buffer.from("hello world") }]);
    // 截掉 local data 中間：header 還在但 data 不全 → 觸發截斷錯誤
    expect(() => unzipStore(buf.subarray(0, 30 + 5 + 4))).toThrow();
  });

  it("竄改內容 CRC 被抓到", () => {
    const buf = zipFiles([{ name: "a.txt", data: Buffer.from("hello world") }]);
    // local data 起點：header(30) + 檔名(5) = offset 35，改第一個內容 byte
    buf[35] ^= 0xff;
    expect(() => unzipStore(buf)).toThrow(/校驗/);
  });
});
