// 還原深模組：驗證備份 zip → 還原前自動備份現況 → 用快照覆寫資料庫＋音檔。
//
// 對外只開一個口：restoreBackup(zipBuf) → { restoredFiles, autoBackupName }。
// route 負責收 multipart 上傳、回傳 JSON。
//
// 安全順序（壞一步就停，不留半套）：
//   1) 先在記憶體裡完整解開＋校驗（CRC/截斷/格式全擋在這裡），爛 zip 碰不到磁碟。
//   2) 還原前用 VACUUM INTO 另存一份現況快照到 data/backups/（檔名帶時間戳），
//      並且先 createBackup() 一份完整 zip 留底 —— 還原錯了還能回頭。
//   3) 斷開 Prisma（$disconnect），SQLite 才能被覆寫；Windows 下開著連線會 EBUSY。
//   4) 覆寫 database.db：經 SQLite 頭（"SQLite format 3\0"）驗證才寫，避免把壞檔灌進去。
//   5) 音檔只收 podcasts/*.mp3（擋住 ../ 跳目錄、擋非 mp3），寫入 data/podcasts/。
//   6) 重連後 SELECT 1 驗證資料庫可讀，失敗直接拋錯（autoBackup 還在，可手動回灌）。

import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { createBackup, dbPathFromUrl } from "./index";
import { unzipStore } from "./unzip";

export type RestoreResult = {
  restoredFiles: string[];
  autoBackupName: string;
  dbRestored: boolean;
  podcastCount: number;
};

const SQLITE_MAGIC = "SQLite format 3\0";

/** 檔名安全檢查：只要 database.db 或 podcasts/ 下的 .mp3，不含路徑跳脫。 */
function assertSafeName(name: string): void {
  if (name === "database.db") return;
  if (/^podcasts\/[A-Za-z0-9._-]+\.mp3$/.test(name)) return;
  throw new Error(`備份內含不預期的檔案，已拒絕還原：${JSON.stringify(name)}`);
}

export async function restoreBackup(zipBuf: Buffer): Promise<RestoreResult> {
  if (zipBuf.length === 0) throw new Error("上傳的檔案是空的");
  if (zipBuf.length > 1024 * 1024 * 1024) throw new Error("備份檔超過 1GB，已拒絕");

  // 1) 記憶體內完整解開＋校驗
  const entries = unzipStore(zipBuf);
  for (const e of entries) assertSafeName(e.name);
  const dbEntry = entries.find((e) => e.name === "database.db");
  if (!dbEntry) throw new Error("備份內沒有 database.db，不是本站產生的備份");
  if (!dbEntry.data.subarray(0, SQLITE_MAGIC.length).toString("binary").startsWith("SQLite format 3")) {
    throw new Error("database.db 不是有效的 SQLite 檔案，拒絕還原");
  }

  const dbPath = dbPathFromUrl(process.env.DATABASE_URL!);
  const backupDir = path.join(process.cwd(), "data", "backups");
  await fs.mkdir(backupDir, { recursive: true });

  // 2) 還原前自動留底：完整 zip 一份
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const autoBackupName = `pre-restore-${stamp}.zip`;
  const auto = await createBackup();
  await fs.writeFile(path.join(backupDir, autoBackupName), auto.buf);

  // 3) 斷開連線 → 覆寫 → 重連
  await db.$disconnect();
  try {
    await fs.copyFile(dbPath, path.join(backupDir, `pre-restore-${stamp}.db`));
    await fs.writeFile(dbPath, dbEntry.data);

    // 4) 音檔還原
    const podDir = path.join(process.cwd(), "data", "podcasts");
    await fs.mkdir(podDir, { recursive: true });
    let podcastCount = 0;
    const restoredFiles = ["database.db"];
    for (const e of entries) {
      if (!e.name.startsWith("podcasts/")) continue;
      const base = path.basename(e.name);
      await fs.writeFile(path.join(podDir, base), e.data);
      restoredFiles.push(e.name);
      podcastCount++;
    }

    // 5) 重連驗證
    await db.$connect();
    await db.$queryRawUnsafe("SELECT 1");
    console.log(`[restore] ${restoredFiles.length} files restored, auto-backup: ${autoBackupName}`);
    return { restoredFiles, autoBackupName, dbRestored: true, podcastCount };
  } catch (e) {
    // 覆寫中途失敗：嘗試重連讓服務恢復可用（壞檔已寫入則需手動回灌 autoBackup）
    await db.$connect().catch(() => undefined);
    throw e;
  }
}
