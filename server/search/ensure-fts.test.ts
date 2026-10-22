// ensureFts 的「同步分支」專屬測試（DEEP 突變測試挖到的覆蓋缺口）。
//
// 為什麼要獨立一個檔：
// ensureFts 用 module 級的 `ftsReady` promise 快取（index.ts:26,35），同一個 process
// 只會執行一次 body。而 index.test.ts 的 resetFixture 第一次呼叫 ensureFts 時
// Note 與 NoteFts 都是空的（筆數相等），同步分支再也沒機會走到——把
// `if (Number(c) !== Number(notes)) await rebuildAll()` 改成 `if (false && ...)`
// 突變會存活。vitest 每個測試檔有獨立的 module registry，所以這裡拿得到
// ftsReady=null 的乾淨實例，能在「第一次呼叫就筆數對不上」的狀態下跑。
//
// 順序獨立性：每個 case 都先 `vi.resetModules()`（清掉 module 級 ftsReady 快取）
// 再把 schema 重建回該 case 需要的形狀，沒有任何跨 case 共享狀態。
//
// 本檔守兩條 ensureFts 的生產語義（皆為 index.ts 的既有行為，實作未改動）：
//   1. 表不存在 → 建表＋整庫回填
//   2. 表存在但筆數對不上 → 整庫重建
import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

const DB_FILE = path.join(os.tmpdir(), `hs-hsa-ensurefts-test-${process.pid}.db`);
const DB_URL = `file:${DB_FILE.replace(/\\/g, "/")}`;

vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@/app/generated/prisma/client");
  return { db: new PrismaClient({ datasources: { db: { url: DB_URL } } }) };
});

/** 與 prisma/migrations 等價的最小 DDL（只建本測試用到的表）。 */
const DDL = [
  `CREATE TABLE "Note" (
     "id" TEXT NOT NULL PRIMARY KEY,
     "title" TEXT NOT NULL DEFAULT '未命名筆記',
     "rawText" TEXT NOT NULL,
     "tags" TEXT NOT NULL DEFAULT '',
     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE TABLE "Generation" (
     "id" TEXT NOT NULL PRIMARY KEY,
     "type" TEXT NOT NULL,
     "status" TEXT NOT NULL DEFAULT 'pending',
     "result" TEXT,
     "error" TEXT,
     "options" TEXT NOT NULL DEFAULT '{}',
     "noteId" TEXT NOT NULL,
     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
];

/** 與 index.ts 建表語句一致，供「表已存在」的情境預先建好。 */
const NOTE_FTS_DDL = `CREATE VIRTUAL TABLE "NoteFts" USING fts5(noteId UNINDEXED, title, body, tags, tokenize='unicode61')`;

const BASELINE = [
  { id: "n-ml", title: "機器學習導論", rawText: "機器學習是人工智慧的一個分支，深度學習使用神經網路。", tags: "資訊,AI" },
  { id: "n-bio", title: "生物第三章", rawText: "細胞是生命的基本單位，粒線體負責產生能量。", tags: "生物,考試" },
  { id: "n-eng", title: "English Notes", rawText: "Machine learning is a branch of artificial intelligence.", tags: "" },
];

/**
 * 準備一個乾淨環境：清掉 module 快取（ftsReady=null）、重建 schema、放回三筆 Note。
 * @param withFtsTable 預先建好 NoteFts 表（模擬「表已存在但索引落後」）
 */
async function prepare(withFtsTable: boolean) {
  vi.resetModules(); // 清掉 module 級 ftsReady 快取，讓 ensureFts 真的執行 body
  const { db } = await import("@/lib/db");
  const { ensureFts } = await import("@/server/search");

  await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "NoteFts"`);
  await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "Note"`);
  await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "Generation"`);
  for (const sql of DDL) await db.$executeRawUnsafe(sql);
  if (withFtsTable) await db.$executeRawUnsafe(NOTE_FTS_DDL);
  for (const n of BASELINE) {
    await db.$executeRawUnsafe(
      `INSERT INTO "Note"("id", "title", "rawText", "tags") VALUES (?, ?, ?, ?)`,
      n.id,
      n.title,
      n.rawText,
      n.tags,
    );
  }

  const ftsCount = async (): Promise<number> => {
    const [{ c }] = await db.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*) AS c FROM NoteFts`);
    return Number(c);
  };
  const noteCount = async (): Promise<number> => {
    const [{ c }] = await db.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*) AS c FROM "Note"`);
    return Number(c);
  };
  return { db, ensureFts, ftsCount, noteCount };
}

afterAll(async () => {
  const { db } = await import("@/lib/db");
  await db.$disconnect();
  // Windows 上偶發 EBUSY（連線剛斷、檔案 handle 未釋放）：重試幾次，仍刪不掉就放著（tmp 檔無害）。
  for (let i = 0; i < 5; i++) {
    try {
      await fs.rm(DB_FILE, { force: true });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
});

describe("ensureFts：首次呼叫（表不存在）", () => {
  // 每個 case 都 vi.resetModules() 重載 Prisma client，A 槽慢速碟上首次初始化容易
  // 撞到 vitest 預設的 5 秒 timeout（實測首次約 1.3s，加上 worker 冷啟動會超時）
  it("表不存在 → 建表並整庫回填（同步分支真的會跑）", { timeout: 30_000 }, async () => {
    // Note 有 3 筆、NoteFts 表還不存在。ensureFts 建表後 count(0) !== notes(3)
    // → 走 `if (Number(c) !== Number(notes)) await rebuildAll()`。
    // 若同步分支被拿掉（突變 `if (false && ...)`），這裡會是 0 列 → 必紅。
    const env = await prepare(false);
    await env.ensureFts();
    expect(await env.ftsCount()).toBe(await env.noteCount());
    expect(await env.ftsCount()).toBe(BASELINE.length);
  });
});

describe("ensureFts：表存在但索引落後（筆數對不上）", () => {
  it("筆數對不上 → 整庫重建回填（不是只建表）", { timeout: 30_000 }, async () => {
    // 表已存在但只有 2 列（模擬「有人直接動 DB / migrate 後殘留」），Note 有 3 筆。
    // ensureFts 應偵測 count(2) !== notes(3) → 整庫重建回 3。
    const env = await prepare(true);
    await env.db.$executeRawUnsafe(
      `INSERT INTO "NoteFts"(noteId, title, body, tags) VALUES ('n-ml', '機器學習', '內文', '')`,
    );
    await env.db.$executeRawUnsafe(
      `INSERT INTO "NoteFts"(noteId, title, body, tags) VALUES ('n-bio', '生物', '內文', '')`,
    );
    expect(await env.ftsCount()).toBe(2);

    await env.ensureFts();

    expect(await env.ftsCount()).toBe(await env.noteCount());
    expect(await env.ftsCount()).toBe(BASELINE.length);
    // 重建後原本缺的 n-eng 索引列真的補回來了（不是靠別的機制）
    const [{ c }] = await env.db.$queryRawUnsafe<{ c: bigint }[]>(
      `SELECT count(*) AS c FROM NoteFts WHERE noteId = 'n-eng'`,
    );
    expect(Number(c)).toBe(1);
  });
});
