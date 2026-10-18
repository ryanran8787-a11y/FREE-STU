// A2 紅燈測試：ReviewCard 持久化深模組的 seam 在 tRPC 介面（attempt.log → review.queue）。
// 內部函數（recordAttempt / listDue / backfill）不直接測 —— codebase-design：介面即測試面。
// 跑在獨立臨時 SQLite（同 search/index.test.ts 模式），不碰 dev.db。
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

const DB_FILE = path.join(os.tmpdir(), `hs-hsa-reviewcard-test-${process.pid}.db`);
const DB_URL = `file:${DB_FILE.replace(/\\/g, "/")}`;

vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@/app/generated/prisma/client");
  return { db: new PrismaClient({ datasources: { db: { url: DB_URL } } }) };
});

const { db } = await import("@/lib/db");
const { appRouter } = await import("@/server/routers");

/** 與 prisma/migrations 等價的最小 DDL（只建本測試用到的表與欄位）。 */
const DDL = [
  `CREATE TABLE "Note" (
     "id" TEXT NOT NULL PRIMARY KEY,
     "title" TEXT NOT NULL DEFAULT '未命名筆記',
     "rawText" TEXT NOT NULL DEFAULT '',
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
  `CREATE TABLE "Attempt" (
     "id" TEXT NOT NULL PRIMARY KEY,
     "genId" TEXT NOT NULL,
     "noteId" TEXT NOT NULL,
     "kind" TEXT NOT NULL DEFAULT 'quiz',
     "qIndex" INTEGER NOT NULL,
     "picked" INTEGER,
     "correct" BOOLEAN NOT NULL,
     "confidence" TEXT NOT NULL DEFAULT 'med',
     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE TABLE "ReviewCard" (
     "id" TEXT NOT NULL PRIMARY KEY,
     "genId" TEXT NOT NULL,
     "noteId" TEXT NOT NULL,
     "kind" TEXT NOT NULL DEFAULT 'quiz',
     "qIndex" INTEGER NOT NULL,
     "question" TEXT NOT NULL DEFAULT '',
     "intervalDays" INTEGER NOT NULL DEFAULT 0,
     "dueAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "lapses" INTEGER NOT NULL DEFAULT 0,
     "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE TABLE "StudyPlan" (
     "id" TEXT NOT NULL PRIMARY KEY,
     "noteId" TEXT NOT NULL,
     "days" INTEGER NOT NULL,
     "difficulty" TEXT NOT NULL DEFAULT 'medium',
     "status" TEXT NOT NULL DEFAULT 'pending',
     "result" TEXT,
     "error" TEXT,
     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE UNIQUE INDEX "ReviewCard_genId_qIndex_key" ON "ReviewCard"("genId", "qIndex")`,
  `CREATE INDEX "ReviewCard_dueAt_idx" ON "ReviewCard"("dueAt")`,
  `CREATE INDEX "ReviewCard_noteId_idx" ON "ReviewCard"("noteId")`,
];

const caller = appRouter.createCaller({});
const QUIZ = JSON.stringify([
  { question: "Q1 第一題", options: ["a", "b", "c"], answer: 0 },
  { question: "Q2 第二題", options: ["a", "b", "c"], answer: 1 },
]);

beforeAll(async () => {
  await fs.rm(DB_FILE, { force: true });
  for (const sql of DDL) await db.$executeRawUnsafe(sql);
  await db.$executeRawUnsafe(`INSERT INTO "Note"("id","title","rawText") VALUES ('n1','筆記一','內文')`);
  await db.$executeRawUnsafe(`INSERT INTO "Generation"("id","type","status","result","noteId") VALUES ('g1','quiz','done',?,'n1')`, QUIZ);
});

afterAll(async () => {
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

describe("A2：attempt.log → review.queue 經 ReviewCard 持久化", () => {
  it("答對後 queue 該題排到未來（interval>0、持久化契約），且重答同一題不重複建卡", async () => {
    await caller.attempt.log({ genId: "g1", qIndex: 0, picked: 0, correct: true, confidence: "high" });
    // 剛答對：interval 3 天 → 還沒到期，queue 不該出現（O(due) 契約：未到期不回）
    const q1 = await caller.review.queue({ limit: 20 });
    expect(q1.items.find((i) => i.genId === "g1" && i.qIndex === 0)).toBeUndefined();
    // 但卡已持久化：查 DB 有一行，intervalDays>0
    const cards = (await db.$queryRawUnsafe(`SELECT * FROM "ReviewCard" WHERE "genId"='g1' AND "qIndex"=0`)) as unknown[];
    expect(cards).toHaveLength(1);
    // 再答一次同一題：仍一行（upsert，不重複建卡）
    await caller.attempt.log({ genId: "g1", qIndex: 0, picked: 0, correct: true, confidence: "high" });
    const cards2 = (await db.$queryRawUnsafe(`SELECT * FROM "ReviewCard" WHERE "genId"='g1' AND "qIndex"=0`)) as unknown[];
    expect(cards2).toHaveLength(1);
  });

  it("答錯後該題當天/明天到期，出現在 queue", async () => {
    // 高信心答錯 interval=0（當天回來）：log 後立刻到期，queue 該出現
    await caller.attempt.log({ genId: "g1", qIndex: 1, picked: 0, correct: false, confidence: "high" });
    const q = await caller.review.queue({ limit: 20 });
    const hit = q.items.find((i) => i.genId === "g1" && i.qIndex === 1);
    expect(hit).toBeDefined();
    expect(hit!.question).toBe("Q2 第二題");
  });

  it("qIndex 越界的作答不建卡（quarantine），attempt 照寫", async () => {
    await caller.attempt.log({ genId: "g1", qIndex: 99, picked: 0, correct: false, confidence: "low" });
    const cards = (await db.$queryRawUnsafe(`SELECT * FROM "ReviewCard" WHERE "genId"='g1' AND "qIndex"=99`)) as unknown[];
    expect(cards).toHaveLength(0);
    const q = await caller.review.queue({ limit: 20 });
    expect(q.items.find((i) => i.qIndex === 99)).toBeUndefined();
  });
});

describe("B1：plan.pinTask → review.queue（kind=plan 快照卡）", () => {
  const PLAN_RESULT = JSON.stringify([{ day: 1, title: "主題一", tasks: ["任務A", "任務B"] }]);
  it("釘選任務後 queue 出現 plan 卡（question 快照），重複釘冪等，unpin 後消失", async () => {
    await db.$executeRawUnsafe(
      `INSERT INTO "StudyPlan"("id","noteId","days","difficulty","status","result") VALUES ('p1','n1',7,'medium','done',?)`,
      PLAN_RESULT,
    );
    await caller.plan.pinTask({ planId: "p1", day: 1, taskIndex: 0 });
    // pin 的 dueAt 是今天本地 08:00；若測試在 08:00 前跑會還沒到期 → 先撥到過去再查 queue（只固定時間，不改形狀）
    // 注意：必須用 Prisma 寫 dueAt（raw SQL 的 'YYYY-MM-DD HH:mm:ss' 無時區格式會讓 Prisma SQLite 的 lte 比較失效）
    await db.reviewCard.updateMany({ where: { genId: "p1" }, data: { dueAt: new Date("2000-01-01T00:00:00+08:00") } });
    const q = await caller.review.queue({ limit: 20 });
    const hit = q.items.find((i) => i.genId === "p1" && i.qIndex === 0);
    expect(hit).toBeDefined();
    expect(hit!.kind).toBe("plan");
    expect(hit!.question).toContain("任務A");
    // 重複釘 = 冪等，仍一行
    await caller.plan.pinTask({ planId: "p1", day: 1, taskIndex: 0 });
    const cards = (await db.$queryRawUnsafe(`SELECT * FROM "ReviewCard" WHERE "genId"='p1'`)) as unknown[];
    expect(cards).toHaveLength(1);
    // unpin = 完成刪卡，queue 不再出現
    await caller.plan.unpinTask({ planId: "p1", day: 1, taskIndex: 0 });
    const q2 = await caller.review.queue({ limit: 20 });
    expect(q2.items.find((i) => i.genId === "p1")).toBeUndefined();
  });
});
