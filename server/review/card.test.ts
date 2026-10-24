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
  return {
    db: new PrismaClient({
      datasources: { db: { url: DB_URL } },
      // 開 query 事件：listDue 的 N+1 守門測試要數「撈 Attempt 的次數」。
      log: [{ emit: "event", level: "query" }],
    }),
  };
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
     "intervalDays" REAL NOT NULL DEFAULT 0,
     "ease" REAL NOT NULL DEFAULT 2.5,
     "streak" INTEGER NOT NULL DEFAULT 0,
     "reviewCount" INTEGER NOT NULL DEFAULT 0,
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
/** 三題測驗：T3-3 與 P1 的 N+1 守門共用。 */
const QUIZ3 = JSON.stringify([
  { question: "A1 第一題", options: ["a", "b", "c"], answer: 0 },
  { question: "A2 第二題", options: ["a", "b", "c"], answer: 1 },
  { question: "A3 第三題", options: ["a", "b", "c"], answer: 2 },
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

  it("答錯（Again）後 10 分鐘到期：先不出現，撥到過去後出現在 queue", async () => {
    // T3-2：高信心答錯 → Again=10/1440 天（≈0.007），dueAt=now+10 分鐘 → 立刻查還沒到期（O(due) 契約）
    await caller.attempt.log({ genId: "g1", qIndex: 1, picked: 0, correct: false, confidence: "high" });
    const rows = (await db.$queryRawUnsafe(`SELECT "intervalDays","ease","streak","lapses","reviewCount" FROM "ReviewCard" WHERE "genId"='g1' AND "qIndex"=1`)) as {
      intervalDays: number; ease: number; streak: number; lapses: number; reviewCount: number;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].intervalDays).toBeCloseTo(10 / 1440, 3);
    expect(rows[0].ease).toBeCloseTo(2.3, 5);
    expect(rows[0].streak).toBe(0);
    expect(rows[0].lapses).toBe(1);
    expect(rows[0].reviewCount).toBe(1);
    const q0 = await caller.review.queue({ limit: 20 });
    expect(q0.items.find((i) => i.genId === "g1" && i.qIndex === 1)).toBeUndefined();
    // 撥到過去（Prisma 寫 dueAt，raw SQL 無時區格式會讓 lte 比較失效）→ 到期出現
    await db.reviewCard.updateMany({ where: { genId: "g1", qIndex: 1 }, data: { dueAt: new Date(Date.now() - 1000) } });
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

describe("T3-3：四檔 SM-2 持久化（recordAttempt 走 attempt.log → review.queue）", () => {
  // 順序獨立性：每個 case 自建自己的 generation（不共用 beforeAll 的固定 id）。
  // 原因：review.queue() 的 lazy backfill 會替「所有」done 的 quiz gen 補冷卡，
  // 只要別的 case 先呼叫過 queue，共用 gen 就會被提前建卡，Hard 的 ×1.2 也會從 1.2 變 1.0。
  let seq = 0;
  async function freshGen(): Promise<string> {
    const id = `t3-${seq++}`;
    await db.generation.create({ data: { id, type: "quiz", status: "done", result: QUIZ3, noteId: "n1" } });
    return id;
  }
  /** 明確清掉該 gen 的卡，讓「冷啟動」這個前置條件由本 case 自己保證。 */
  async function coldStart(genId: string): Promise<void> {
    await db.reviewCard.deleteMany({ where: { genId } });
  }
  async function cardOf(genId: string, qIndex: number) {
    return db.reviewCard.findUnique({ where: { genId_qIndex: { genId, qIndex } } });
  }

  it("高信心答錯 → Again：intervalDays≈10/1440、ease 2.3、streak 0、lapses 1、reviewCount 1", async () => {
    const genId = await freshGen();
    await coldStart(genId);
    const before = Date.now();
    await caller.attempt.log({ genId, qIndex: 0, picked: 1, correct: false, confidence: "high" });
    const card = await cardOf(genId, 0);
    expect(card).not.toBeNull();
    // 斷言意圖：間隔是「10 分鐘級」，不是字面上的 0.007 這個 rounding 副作用
    expect(card!.intervalDays).toBeCloseTo(10 / 1440, 3);
    expect(card!.intervalDays).toBeGreaterThan(0);
    expect(card!.intervalDays).toBeLessThan(1);
    expect(card!.ease).toBeCloseTo(2.3, 5);
    expect(card!.streak).toBe(0);
    expect(card!.lapses).toBe(1);
    expect(card!.reviewCount).toBe(1);
    // dueAt = 作答時間 + 約 10 分鐘（落在未來、且遠早於 1 天）
    const due = card!.dueAt.getTime();
    expect(due).toBeGreaterThan(before + 9 * 60_000);
    expect(due).toBeLessThan(before + 11 * 60_000);
  });

  it("低信心答對 → Hard（冷啟動）：interval 1.2 天，不是 Good 的 3 天起步", async () => {
    const genId = await freshGen();
    await coldStart(genId); // 自己保證「沒有卡」，不靠其他 case 的副作用
    // quiz 由 server 依 picked 判分：qIndex 0 的正解是 0，picked 必須選 0 才算答對
    await caller.attempt.log({ genId, qIndex: 0, picked: 0, correct: true, confidence: "low" });
    const card = await cardOf(genId, 0);
    expect(card).not.toBeNull();
    // 冷啟動：interval 預設 1 → max(1, 1×1.2) = 1.2
    expect(card!.intervalDays).toBeCloseTo(1.2, 4);
    // 意圖：Hard 是「比 1 天長、但遠短於 Good 的 3 天」，不該是 Good 的起跳值
    expect(card!.intervalDays).toBeGreaterThanOrEqual(1);
    expect(card!.intervalDays).toBeLessThan(3);
    expect(card!.ease).toBeCloseTo(2.35, 5);
    expect(card!.streak).toBe(0);
    expect(card!.reviewCount).toBe(1);
  });

  it("低信心答對 → Hard（已有冷卡）：與冷啟動一致，都是 1.2 天（P1 修好 1.0/1.2 不一致）", async () => {
    // 修前：cards.ts 直接吃卡上的 intervalDays=0，Hard 走 max(1, 0×1.2)=1.0；
    // 冷啟動（無卡）走預設 interval=1 → 1.2。同一輸入因「有沒有先開過複習頁
    // （lazy backfill 建冷卡）」而得到兩種結果。
    // 修後：cards.ts 把 intervalDays<=0 視同冷啟動，兩條路徑都走 1.2。
    // 本 case 與上一條（冷啟動）配對，守住「兩條路徑結果相同」這個契約。
    const genId = await freshGen();
    await db.reviewCard.create({
      data: {
        genId, noteId: "n1", kind: "quiz", qIndex: 0, question: "A1 第一題",
        intervalDays: 0, ease: 2.5, streak: 0, reviewCount: 0, lapses: 0, dueAt: new Date(),
      },
    });
    await caller.attempt.log({ genId, qIndex: 0, picked: 0, correct: true, confidence: "low" });
    const card = await cardOf(genId, 0);
    expect(card).not.toBeNull();
    expect(card!.intervalDays).toBeCloseTo(1.2, 4);
    expect(card!.intervalDays).toBeLessThan(3); // 仍不是 Good 的 3 天起步
    expect(card!.ease).toBeCloseTo(2.35, 5);
    expect(card!.streak).toBe(0);
    expect(card!.reviewCount).toBe(1);
  });

  it("連續作答累積 reviewCount 與 streak（Good 連兩次：3 → 7.5 天）", async () => {
    const genId = await freshGen();
    await coldStart(genId);
    await caller.attempt.log({ genId, qIndex: 0, picked: 0, correct: true, confidence: "med" });
    const first = await cardOf(genId, 0);
    expect(first).not.toBeNull();
    expect(first!.intervalDays).toBeCloseTo(3, 4);
    expect(first!.streak).toBe(1);
    expect(first!.reviewCount).toBe(1);
    await caller.attempt.log({ genId, qIndex: 0, picked: 0, correct: true, confidence: "med" });
    const second = await cardOf(genId, 0);
    expect(second).not.toBeNull();
    expect(second!.intervalDays).toBeCloseTo(7.5, 4); // 3 × ease 2.5
    expect(second!.streak).toBe(2);
    expect(second!.reviewCount).toBe(2);
    expect(second!.ease).toBeCloseTo(2.5, 5);
  });

  it("舊卡 lazy backfill：無卡但已有作答歷史 → replaySm2 補出合理 ease/streak/reviewCount", async () => {
    // 兩次 Good 歷史、沒有卡 → 首次 review.queue 的 backfill 用 replaySm2 重建
    const genId = await freshGen();
    await coldStart(genId);
    const t1 = new Date(Date.now() - 20 * 86_400_000);
    const t2 = new Date(Date.now() - 10 * 86_400_000);
    await db.attempt.create({ data: { genId, noteId: "n1", kind: "quiz", qIndex: 0, picked: 0, correct: true, confidence: "med", createdAt: t1 } });
    await db.attempt.create({ data: { genId, noteId: "n1", kind: "quiz", qIndex: 0, picked: 0, correct: true, confidence: "med", createdAt: t2 } });
    await caller.review.queue({ limit: 50 });
    const card = await cardOf(genId, 0);
    expect(card).not.toBeNull();
    expect(card!.intervalDays).toBeCloseTo(7.5, 4);
    expect(card!.ease).toBeCloseTo(2.5, 5);
    expect(card!.streak).toBe(2);
    expect(card!.reviewCount).toBe(2);
    expect(card!.lapses).toBe(0);
  });

  it("舊卡（reviewCount=0）再作答：只重播「當次之前」歷史，當次不重複計步", async () => {
    // 自建「T3-2 遷移前的舊卡」形狀：reviewCount=0、預設 ease/streak，不依賴其他 case 的 backfill。
    const genId = await freshGen();
    await db.reviewCard.create({
      data: {
        genId, noteId: "n1", kind: "quiz", qIndex: 0, question: "A1 第一題",
        intervalDays: 0, ease: 2.5, streak: 0, reviewCount: 0, lapses: 0, dueAt: new Date(),
      },
    });
    await db.attempt.create({
      data: { genId, noteId: "n1", kind: "quiz", qIndex: 0, picked: 0, correct: true, confidence: "med", createdAt: new Date(Date.now() - 10 * 86_400_000) },
    });
    await caller.attempt.log({ genId, qIndex: 0, picked: 0, correct: true, confidence: "med" });
    const card = await cardOf(genId, 0);
    // 歷史(1 步 Good) → 3 天/streak1/reviewCount1，再走當次 Good → 7.5 天/streak2/reviewCount2。
    // 若 attemptId 守衛失效（當次被一起重播）→ 會變成 18.75 天/streak3/reviewCount3，這裡必紅。
    expect(card).not.toBeNull();
    expect(card!.intervalDays).toBeCloseTo(7.5, 4);
    expect(card!.streak).toBe(2);
    expect(card!.reviewCount).toBe(2);
    expect(card!.ease).toBeCloseTo(2.5, 5);
  });
});

describe("P1：listDue 的 N+1 守門（撈 Attempt 必須是批次，不是逐卡）", () => {
  it("到期卡從 1 張增到多張，撈 Attempt 的查詢次數不隨卡片數成長", async () => {
    /** 建立 n 張到期卡（各自有作答歷史），回傳它們的 genId。 */
    async function seedDueCards(n: number, tag: string): Promise<void> {
      for (let i = 0; i < n; i++) {
        const genId = `${tag}-${i}`;
        await db.generation.create({ data: { id: genId, type: "quiz", status: "done", result: QUIZ3, noteId: "n1" } });
        await db.reviewCard.create({
          data: {
            genId, noteId: "n1", kind: "quiz", qIndex: 0, question: "A1 第一題",
            intervalDays: 3, ease: 2.5, streak: 1, reviewCount: 1, lapses: 0,
            dueAt: new Date(Date.now() - 60_000), // 已到期
          },
        });
        await db.attempt.create({
          data: { genId, noteId: "n1", kind: "quiz", qIndex: 0, picked: 0, correct: true, confidence: "med" },
        });
      }
    }

    /** 數一次 review.queue 期間「查 Attempt 表」的查詢次數（Prisma 產生的 SQL 用反引號包表名）。 */
    async function countAttemptQueries(): Promise<number> {
      let n = 0;
      const onQuery = (e: { query: string }) => {
        if (e.query.includes(".`Attempt`")) n++;
      };
      // 不用可選鏈：若 Prisma event API 漂移讓 $on 消失，計數會永遠 0，
      // 而 0<=0 會讓下面的守門斷言照過（守門形同虛設）。這裡直接斷言 API 存在。
      const client = db as unknown as {
        $on: (ev: string, cb: (e: { query: string }) => void) => void;
        $off?: (ev: string, cb: (e: { query: string }) => void) => void;
      };
      expect(typeof client.$on).toBe("function");
      // Prisma 的 query 事件是非同步發出的：註冊後要等事件送達才能讀計數，
      // 不能呼叫完就立刻讀（會永遠是 0，測試形同虛設）。
      client.$on("query", onQuery);
      try {
        await caller.review.queue({ limit: 100 });
        await new Promise((r) => setTimeout(r, 100)); // 等 query 事件 flush
      } finally {
        client.$off?.("query", onQuery);
      }
      return n;
    }

    await seedDueCards(1, "n1-case");
    const one = await countAttemptQueries();

    await seedDueCards(6, "n6-case");
    const many = await countAttemptQueries();

    // 先釘住 instrumentation 本身有效：真的收到查 Attempt 的事件。
    // 沒有這條，event 掛不上時 one/many 都是 0，下面 0<=0+1 照過 → 守門是假的。
    expect(one).toBeGreaterThanOrEqual(1);
    expect(many).toBeGreaterThanOrEqual(1);
    // N+1 的形狀：逐卡查時每次多 1 次，many 會是 one 的 7 倍左右。
    // 批次化之後撈 Attempt 的次數與到期卡數無關（固定 1 次批次查詢）。
    // 用關係式而非硬編碼上限：日後正當多一次批次查詢也不該誤紅。
    expect(many).toBeLessThanOrEqual(one + 1);
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
