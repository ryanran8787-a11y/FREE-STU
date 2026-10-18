// 搜尋索引的整合測試：跑在獨立的臨時 SQLite 上（不碰 dev.db、不需要 .env），
// 因此 CI 也能跑。這裡驗的是純函數測試蓋不到的部分——FTS5 的 SQL 契約：
// bigram 經過 unicode61 後是否還完整、中文兩字查詢是否命中、bm25 排序、惡意語法是否安全。
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

beforeAll(async () => {
  await fs.rm(DB_FILE, { force: true });
  for (const sql of DDL) await db.$executeRawUnsafe(sql);
  await addNote(
    "n-ml",
    "機器學習導論",
    "機器學習是人工智慧的一個分支，深度學習使用神經網路。監督式學習需要標註資料。",
    "資訊,AI",
  );
  await addNote("n-bio", "生物第三章", "細胞是生命的基本單位，粒線體負責產生能量。", "生物,考試");
  await addNote("n-eng", "English Notes", "Machine learning is a branch of artificial intelligence.", "");
});

afterAll(async () => {
  await db.$disconnect();
  await fs.rm(DB_FILE, { force: true });
});

describe("ensureFts", () => {
  it("首次呼叫建表並回填既有筆記", async () => {
    await ensureFts();
    const [{ c }] = await db.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*) AS c FROM NoteFts`);
    expect(Number(c)).toBe(3);
  });

  it("重複呼叫不會重複建表（共用同一個 promise）", async () => {
    await Promise.all([ensureFts(), ensureFts(), ensureFts()]);
    const [{ c }] = await db.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*) AS c FROM NoteFts`);
    expect(Number(c)).toBe(3);
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
    await db.$executeRawUnsafe(`UPDATE "Note" SET "rawText" = ? WHERE "id" = 'n-new'`, "電解質溶液會導電。");
    await indexNote("n-new");
    expect((await searchNotes("電解質")).map((h) => h.noteId)).toContain("n-new");
    expect(await searchNotes("莫耳")).toEqual([]);
  });

  it("removeNote 後不再命中", async () => {
    // 真實刪除流程：先刪 Note row（cascade 掉 Generation）再清索引
    await db.$executeRawUnsafe(`DELETE FROM "Note" WHERE "id" = 'n-new'`);
    await removeNote("n-new");
    expect(await searchNotes("電解質")).toEqual([]);
  });

  it("indexNote 對不存在的筆記等同移除（不拋錯）", async () => {
    await expect(indexNote("n-ghost")).resolves.toBeUndefined();
  });

  it("rebuildAll 重建後筆數正確且檢索仍可用", async () => {
    const n = await rebuildAll();
    expect(n).toBe(3);
    const [{ c }] = await db.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*) AS c FROM NoteFts`);
    expect(Number(c)).toBe(3);
    expect((await searchNotes("學習")).map((h) => h.noteId)).toContain("n-ml");
  });
});
