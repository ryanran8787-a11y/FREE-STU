import { describe, expect, it } from "vitest";
import { zipFiles } from "./zip";
import { unzipStore } from "./unzip";

/** 還原前的安全門：檔名白名單＋SQLite 魔數，與 restore.ts 同規則（函式層 mirror）。 */
function assertSafeName(name: string): void {
  if (name === "database.db") return;
  if (/^podcasts\/[A-Za-z0-9._-]+\.mp3$/.test(name)) return;
  throw new Error(`備份內含不預期的檔案，已拒絕還原：${JSON.stringify(name)}`);
}

describe("restore 安全門", () => {
  it("本站備份 zip：檔名全過門＋SQLite 魔數正確", () => {
    const fakeDb = Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.from("fake-page-data")]);
    const buf = zipFiles([
      { name: "database.db", data: fakeDb },
      { name: "podcasts/gen-abc.mp3", data: Buffer.from("ID3 fake") },
    ]);
    const entries = unzipStore(buf);
    expect(() => entries.forEach((e) => assertSafeName(e.name))).not.toThrow();
    expect(entries.find((e) => e.name === "database.db")!.data.subarray(0, 16).toString("binary")).toContain("SQLite format 3");
  });

  it("../ 跳目錄被擋", () => {
    expect(() => assertSafeName("podcasts/../../evil.mp3")).toThrow(/不預期/);
    expect(() => assertSafeName("../database.db")).toThrow(/不預期/);
  });

  it("非 mp3 音檔被擋", () => {
    expect(() => assertSafeName("podcasts/note.exe")).toThrow(/不預期/);
    expect(() => assertSafeName("podcasts/sub/a.mp3")).toThrow(/不預期/);
  });

  it("陌生頂層檔案被擋", () => {
    expect(() => assertSafeName("README.txt")).toThrow(/不預期/);
    expect(() => assertSafeName("database.db-wal")).toThrow(/不預期/);
  });

  it("缺 database.db 的 zip：還原端必須拒絕", () => {
    const buf = zipFiles([{ name: "podcasts/a.mp3", data: Buffer.from("x") }]);
    const entries = unzipStore(buf);
    expect(entries.find((e) => e.name === "database.db")).toBeUndefined();
  });

  it("SQLite 魔數不對：還原端必須拒絕", () => {
    const buf = zipFiles([{ name: "database.db", data: Buffer.from("this is not sqlite") }]);
    const dbEntry = unzipStore(buf).find((e) => e.name === "database.db")!;
    expect(dbEntry.data.subarray(0, 16).toString("binary")).not.toContain("SQLite format 3");
  });
});
