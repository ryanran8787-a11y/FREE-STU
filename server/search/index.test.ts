// 搜尋索引的整合測試：跑在獨立的臨時 SQLite 上（不碰 dev.db、不需要 .env），
// 因此 CI 也能跑。這裡驗的是純函數測試蓋不到的部分——FTS5 的 SQL 契約：
// bigram 經過 unicode61 後是否還完整、中文兩字查詢是否命中、bm25 排序、惡意語法是否安全。
//
// 順序獨立性（重要）：每個 case 之前都重設回「三筆基準筆記 + 索引同步」的已知起點。
// 這個檔原本有兩顆順序耦合地雷：
//   1) ensureFts／rebuildAll 硬編碼 toBe(3)，但別的 case 留下的 n-new 還在 → 數到 4。
//   2) n-new 的 UPDATE／removeNote case 依賴前一個 case 先建好 n-new，順序一換就改到 0 列。
// 現在每個 case 自建前置（beforeEach 重設），不靠其他 case 的副作用。
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

const DB_FILE = path.join(os.tmpdir(), `hs-hsa-search-test-${process.pid}.db`);
const DB_URL = `file:${DB_FILE.replace(/\\/g, "/")}`;

vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@/app/generated/prisma/client");
  return { db: new PrismaClient({ datasources: { db: { url: DB_URL } } }) };
});

const { db } = await import("@/lib/db");
const { ensureFts, indexNote, removeNote, searchNotes, rebuildAll } = await import("@/server/search");

/** 與 prisma/migrations 等價的最小 DDL（只建本測試用到的表與欄位）。 */
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

async function addNote(id: string, title: string, rawText: string, tags = ""): Promise<void> {
  await db.$executeRawUnsafe(
    `INSERT INTO "Note"("id", "title", "rawText", "tags") VALUES (?, ?, ?, ?)`,
    id,
    title,
    rawText,
    tags,
  );
}

/** 每個 case 的已知起點：三筆基準筆記，且索引已同步。 */
const BASELINE = [
  {
    id: "n-ml",
    title: "機器學習導論",
    rawText: "機器學習是人工智慧的一個分支，深度學習使用神經網路。監督式學習需要標註資料。",
    tags: "資訊,AI",
  },
  { id: "n-bio", title: "生物第三章", rawText: "細胞是生命的基本單位，粒線體負責產生能量。", tags: "生物,考試" },
  { id: "n-eng", title: "English Notes", rawText: "Machine learning is a branch of artificial intelligence.", tags: "" },
];

async function noteCount(): Promise<number> {
  const [{ c }] = await db.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*) AS c FROM "Note"`);
  return Number(c);
}

async function ftsCount(): Promise<number> {
  const [{ c }] = await db.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*) AS c FROM NoteFts`);
  return Number(c);
}

/** 重設 DB 與索引到基準狀態（清資料 → 建表 → 放回三筆 → 重建索引）。 */
async function resetFixture(): Promise<void> {
  await db.$executeRawUnsafe(`DELETE FROM "Generation"`);
  await db.$executeRawUnsafe(`DELETE FROM "Note"`);
  await ensureFts(); // 首次呼叫會建 NoteFts 表（Note/NoteFts 皆空 → 不觸發回填）
  await db.$executeRawUnsafe(`DELETE FROM NoteFts`);
  for (const n of BASELINE) await addNote(n.id, n.title, n.rawText, n.tags);
  await rebuildAll();
}

beforeAll(async () => {
  await fs.rm(DB_FILE, { force: true });
  for (const sql of DDL) await db.$executeRawUnsafe(sql);
});

beforeEach(async () => {
  await resetFixture();
});

afterAll(async () => {
  await db.$disconnect();
  // Windows 上偶發 EBUSY（連線剛斷、檔案 handle 未釋放）：重試幾次，仍刪不掉就放著（tmp 檔無害）。
  // 不對它 fail：這是清理步驟，不是被測行為。
  for (let i = 0; i < 5; i++) {
    try {
      await fs.rm(DB_FILE, { force: true });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
});

describe("ensureFts", () => {
  it("索引與 Note 同步：筆數相等，且每筆基準筆記都有一列", async () => {
    await ensureFts();
    expect(await ftsCount()).toBe(await noteCount());
    for (const n of BASELINE) {
      const [{ c }] = await db.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*) AS c FROM NoteFts WHERE noteId = ?`, n.id);
      expect(Number(c)).toBe(1);
    }
  });

  it("重複／併發呼叫不會重複建列（共用同一個 promise）", async () => {
    await Promise.all([ensureFts(), ensureFts(), ensureFts()]);
    expect(await ftsCount()).toBe(await noteCount());
  });

  it("索引落後於資料時，rebuildAll 依 Note 現況整庫回填", async () => {
    // 這條測的是 rebuildAll 本身（ensureFts 的同步分支由 ensure-fts.test.ts 專測，
    // 因為 ftsReady 的 module 級快取讓它在本檔的 fixture 下走不到）。
    // 直接寫 Note（繞過 indexNote）模擬「有人直接動 DB」造成的索引落後
    await addNote("n-late", "熱力學", "熱力學第二定律的核心是熵。");
    expect(await searchNotes("定律")).toEqual([]); // 還沒進索引
    const n = await rebuildAll();
    expect(n).toBe(await noteCount()); // 回填筆數 = 當下 Note 數（不硬編碼）
    expect((await searchNotes("定律")).map((h) => h.noteId)).toContain("n-late");
  });
});

describe("searchNotes：中文子字串檢索", () => {
  it("兩字中文詞命中含它的長詞（bigram 展開的核心保證）", async () => {
    const hits = await searchNotes("學習");
    expect(hits.map((h) => h.noteId)).toContain("n-ml");
  });

  it("完整詞也命中", async () => {
    const hits = await searchNotes("機器學習");
    expect(hits[0]?.noteId).toBe("n-ml");
  });

  it("不同詞命中不同筆記", async () => {
    const hits = await searchNotes("粒線體");
    expect(hits.map((h) => h.noteId)).toEqual(["n-bio"]);
  });

  it("英文檢索可用且不分大小寫", async () => {
    const hits = await searchNotes("MACHINE learning");
    expect(hits.map((h) => h.noteId)).toContain("n-eng");
  });

  it("回傳標題、摘要與生成數", async () => {
    // 自建前置：本 case 需要 n-ml 有恰好一筆 Generation（beforeEach 已清空 Generation）
    await db.$executeRawUnsafe(
      `INSERT INTO "Generation"("id", "type", "status", "noteId") VALUES ('g1', 'quiz', 'done', 'n-ml')`,
    );
    const [hit] = await searchNotes("學習");
    expect(hit.title).toBe("機器學習導論");
    expect(hit.genCount).toBe(1);
    expect(hit.snippet).toContain("學習");
    expect(hit.tags).toEqual(["資訊", "AI"]);
  });
});

describe("searchNotes：標籤", () => {
  it("標籤可被搜尋命中", async () => {
    const hits = await searchNotes("生物");
    expect(hits.map((h) => h.noteId)).toContain("n-bio");
  });

  it("標籤以陣列回傳", async () => {
    const hits = await searchNotes("考試");
    expect(hits[0]?.tags).toEqual(["生物", "考試"]);
  });
});

describe("searchNotes：安全性與邊界", () => {
  it("空查詢回空陣列（不查 DB）", async () => {
    expect(await searchNotes("")).toEqual([]);
    expect(await searchNotes("   ")).toEqual([]);
    expect(await searchNotes("!@#$%")).toEqual([]);
  });

  it("FTS5 語法字元不會拋錯（使用者亂打也不會 500）", async () => {
    for (const q of ['NEAR("a"', "a AND", "*", "(((", "-x", '機器"學習', "NOT OR AND"]) {
      await expect(searchNotes(q)).resolves.toBeInstanceOf(Array);
    }
  });

  it("查不到的詞回空陣列", async () => {
    expect(await searchNotes("量子力學")).toEqual([]);
  });

  it("limit 生效", async () => {
    const hits = await searchNotes("學習", 1);
    expect(hits.length).toBeLessThanOrEqual(1);
  });
});

describe("indexNote／removeNote／rebuildAll", () => {
  it("新增筆記後可立即搜到", async () => {
    await addNote("n-new", "化學原理", "莫耳是化學計量的基本單位。");
    await indexNote("n-new");
    expect((await searchNotes("莫耳")).map((h) => h.noteId)).toContain("n-new");
  });

  it("更新內容後索引跟著更新，舊詞不再命中", async () => {
    // 自建前置：不依賴「新增筆記後可立即搜到」先跑過
    await addNote("n-new", "化學原理", "莫耳是化學計量的基本單位。");
    await indexNote("n-new");
    await db.$executeRawUnsafe(`UPDATE "Note" SET "rawText" = ? WHERE "id" = 'n-new'`, "電解質溶液會導電。");
    await indexNote("n-new");
    expect((await searchNotes("電解質")).map((h) => h.noteId)).toContain("n-new");
    expect(await searchNotes("莫耳")).toEqual([]);
  });

  it("removeNote 後不再命中", async () => {
    // 自建前置：同上，自己建自己刪
    await addNote("n-new", "化學原理", "莫耳是化學計量的基本單位。");
    await indexNote("n-new");
    // 真實刪除流程：先刪 Note row（cascade 掉 Generation）再清索引
    await db.$executeRawUnsafe(`DELETE FROM "Note" WHERE "id" = 'n-new'`);
    await removeNote("n-new");
    expect(await searchNotes("莫耳")).toEqual([]);
    expect(await ftsCount()).toBe(await noteCount()); // 沒有留下孤兒索引列
  });

  it("indexNote 對不存在的筆記等同移除（不拋錯）", async () => {
    await expect(indexNote("n-ghost")).resolves.toBeUndefined();
    expect(await ftsCount()).toBe(await noteCount()); // 不會多出孤兒列
  });

  it("rebuildAll 重建後筆數正確且檢索仍可用", async () => {
    // 斷言「重建筆數 = 當下 Note 數」，不寫死 3：多插一筆筆記也不該讓這條紅
    const expected = await noteCount();
    const n = await rebuildAll();
    expect(n).toBe(expected);
    expect(await ftsCount()).toBe(expected);
    expect((await searchNotes("學習")).map((h) => h.noteId)).toContain("n-ml");
  });
});
