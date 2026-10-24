// review.summary 的呼叫端測試（P0 時區修復的消費端）。
//
// 為什麼需要這個檔：lib/local-day.ts 的純函數測得很紮實（12 條），但真正消費它的
// review.ts 沒人罩——如果 byDay 分桶或 streak 迴圈被改錯，純函數測試全綠但功能壞掉。
//
// 這個檔的核心價值是釘住「切日必須用本地時區」這件事在 router 層也成立：
// 種子資料刻意造「本地凌晨 01:30」的作答（UTC 下會落到前一天），
// 若有人把 byDay 的 key 改回 toISOString().slice(0,10)，這裡必紅。
//
// 期望值一律用 localDayKey() 動態算，不硬編碼日期字串：
// 硬編碼會讓測試隨執行時間壞掉，也會在 UTC CI 上失去意義。
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { addLocalDays, localDayKey, startOfLocalDay } from "@/lib/local-day";

const DB_FILE = path.join(os.tmpdir(), `hs-hsa-review-summary-test-${process.pid}.db`);
const DB_URL = `file:${DB_FILE.replace(/\\/g, "/")}`;

vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@/app/generated/prisma/client");
  return { db: new PrismaClient({ datasources: { db: { url: DB_URL } } }) };
});

const { db } = await import("@/lib/db");
const { appRouter } = await import("@/server/routers");

/** 與 prisma/migrations 等價的最小 DDL（summary 只碰 Note / Attempt / Generation）。 */
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
];

const caller = appRouter.createCaller({});

/** 本地某天的 hh:mm 時刻（用本地建構子，不受時區影響語義）。 */
function localAt(dayOffset: number, hour: number, minute = 0): Date {
  const d = startOfLocalDay(new Date());
  const shifted = addLocalDays(d, dayOffset);
  shifted.setHours(hour, minute, 0, 0);
  return shifted;
}

/** 直接寫一筆 Attempt（summary 只讀 Attempt，不需要真走 attempt.log）。 */
async function seedAttempt(o: {
  id: string;
  at: Date;
  correct: boolean;
  confidence?: "high" | "med" | "low";
  noteId?: string;
}): Promise<void> {
  await db.attempt.create({
    data: {
      id: o.id,
      genId: "g1",
      noteId: o.noteId ?? "n1",
      kind: "quiz",
      qIndex: 0,
      picked: 0,
      correct: o.correct,
      confidence: o.confidence ?? "med",
      createdAt: o.at,
    },
  });
}

async function clearAttempts(): Promise<void> {
  await db.$executeRawUnsafe(`DELETE FROM "Attempt"`);
}

beforeAll(async () => {
  await fs.rm(DB_FILE, { force: true });
  for (const sql of DDL) await db.$executeRawUnsafe(sql);
  await db.$executeRawUnsafe(`INSERT INTO "Note"("id","title","rawText") VALUES ('n1','筆記一','內文')`);
  await db.$executeRawUnsafe(`INSERT INTO "Generation"("id","type","status","result","noteId") VALUES ('g1','quiz','done','[]','n1')`);
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

describe("review.summary：本地時區切日（P0 修復的消費端）", () => {
  it("本地凌晨 01:30 的作答，落在「當天」而不是前一天（時區 bug 的核心）", async () => {
    await clearAttempts();
    // 造昨天凌晨 01:30 的作答：UTC（台北 -8h）下這個時刻是「前一天的 17:30」。
    // 用 toISOString 切日會被算到前天，用 localDayKey 才是昨天。
    const earlyMorning = localAt(-1, 1, 30);
    await seedAttempt({ id: "a-early", at: earlyMorning, correct: true });

    const s = await caller.review.summary({ days: 30 });
    const expectedDay = localDayKey(earlyMorning);

    // 這筆作答必須出現在「它自己的本地日」那一桶
    const bucket = s.days.find((d) => d.date === expectedDay);
    expect(bucket).toBeDefined();
    expect(bucket!.total).toBe(1);
    expect(bucket!.correct).toBe(1);

    // 且不該跑到前一天（toISOString 的錯誤結果）
    const utcDay = earlyMorning.toISOString().slice(0, 10);
    if (utcDay !== expectedDay) {
      // 非 UTC 時區才有意義的對照：錯誤的那一桶不該有這筆
      expect(s.days.find((d) => d.date === utcDay)?.total ?? 0).toBe(0);
    }
  });

  it("同一天的凌晨與深夜算同一桶（本地日邊界）", async () => {
    await clearAttempts();
    const early = localAt(-2, 0, 30); // 00:30
    const late = localAt(-2, 23, 30); // 23:30
    await seedAttempt({ id: "a-e", at: early, correct: true });
    await seedAttempt({ id: "a-l", at: late, correct: false });

    const s = await caller.review.summary({ days: 30 });
    const key = localDayKey(early);
    expect(localDayKey(late)).toBe(key); // 前提確認
    const bucket = s.days.find((d) => d.date === key);
    expect(bucket).toBeDefined();
    expect(bucket!.total).toBe(2);
    expect(bucket!.correct).toBe(1);
    expect(bucket!.accuracy).toBe(50);
  });

  it("streak：連續三天作答算 3；中間有空檔就從最近那段算", async () => {
    await clearAttempts();
    // 昨天、前天、大前天連續三天（今天不答，允許）
    await seedAttempt({ id: "s1", at: localAt(-1, 12), correct: true });
    await seedAttempt({ id: "s2", at: localAt(-2, 12), correct: true });
    await seedAttempt({ id: "s3", at: localAt(-3, 12), correct: true });
    // 空一天（-4 不答），再往前有作答 → 不該被算進 streak
    await seedAttempt({ id: "s5", at: localAt(-5, 12), correct: true });

    const s = await caller.review.summary({ days: 30 });
    expect(s.streak).toBe(3);
  });

  it("streak：今天有作答也算進連續天數", async () => {
    await clearAttempts();
    await seedAttempt({ id: "t0", at: localAt(0, 0, 5), correct: true }); // 今天 00:05（凌晨，也是時區邊界）
    await seedAttempt({ id: "t1", at: localAt(-1, 12), correct: true });

    const s = await caller.review.summary({ days: 30 });
    expect(s.streak).toBe(2);
  });

  it("streak：完全沒作答為 0", async () => {
    await clearAttempts();
    const s = await caller.review.summary({ days: 30 });
    expect(s.streak).toBe(0);
    expect(s.total).toBe(0);
    expect(s.days).toEqual([]);
  });

  it("total / correct / accuracy 與信心校準基本正確", async () => {
    await clearAttempts();
    await seedAttempt({ id: "c1", at: localAt(-1, 12), correct: true, confidence: "high" });
    await seedAttempt({ id: "c2", at: localAt(-1, 13), correct: false, confidence: "high" });
    await seedAttempt({ id: "c3", at: localAt(-2, 12), correct: true, confidence: "low" });

    const s = await caller.review.summary({ days: 30 });
    expect(s.total).toBe(3);
    expect(s.correct).toBe(2);
    expect(s.accuracy).toBe(67); // Math.round(2/3*100)
    // 信心校準：high 1/2 = 50%，low 1/1 = 100%
    expect(s.calib.high).toBe(50);
    expect(s.calib.low).toBe(100);
    expect(s.calib.med).toBeNull(); // 沒有 med 作答
  });

  it("days 排序為時間序，且只回有作答的本地日", async () => {
    await clearAttempts();
    await seedAttempt({ id: "o1", at: localAt(-1, 12), correct: true });
    await seedAttempt({ id: "o2", at: localAt(-5, 12), correct: true });

    const s = await caller.review.summary({ days: 30 });
    expect(s.days).toHaveLength(2);
    expect(s.days.map((d) => d.date)).toEqual([localDayKey(localAt(-5, 12)), localDayKey(localAt(-1, 12))]);
    // 字典序 = 時間序
    expect([...s.days.map((d) => d.date)].sort()).toEqual(s.days.map((d) => d.date));
  });

  it("視窗外（超過 days）的作答不計入", async () => {
    await clearAttempts();
    await seedAttempt({ id: "in", at: localAt(-3, 12), correct: true });
    await seedAttempt({ id: "out", at: localAt(-20, 12), correct: true });

    const s7 = await caller.review.summary({ days: 7 });
    expect(s7.total).toBe(1); // 只有 -3 那筆在 7 天視窗內
    const s30 = await caller.review.summary({ days: 30 });
    expect(s30.total).toBe(2); // 兩筆都在 30 天視窗內
  });

  it("弱點主題：答錯的筆記依錯誤數排序", async () => {
    await clearAttempts();
    await db.$executeRawUnsafe(`INSERT OR IGNORE INTO "Note"("id","title","rawText") VALUES ('n2','筆記二','內文二')`);
    await seedAttempt({ id: "w1", at: localAt(-1, 12), correct: false, noteId: "n1" });
    await seedAttempt({ id: "w2", at: localAt(-1, 13), correct: false, noteId: "n1" });
    await seedAttempt({ id: "w3", at: localAt(-1, 14), correct: false, noteId: "n2" });
    await seedAttempt({ id: "w4", at: localAt(-1, 15), correct: true, noteId: "n2" });

    const s = await caller.review.summary({ days: 30 });
    expect(s.weakNotes[0]).toEqual({ noteId: "n1", wrong: 2 });
    expect(s.weakNotes[1]).toEqual({ noteId: "n2", wrong: 1 });
  });
});
