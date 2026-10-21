import { describe, expect, it } from "vitest";
import {
  computeDue,
  ratingOf,
  replaySm2,
  scheduleOne,
  scheduleSm2,
  type QueueItemInput,
} from "./queue";

const DAY = 86_400_000;
const NOW = new Date("2026-10-18T12:00:00+08:00").getTime();

function item(events: QueueItemInput["events"]): QueueItemInput {
  return { noteId: "n1", noteTitle: "民法", genId: "g1", kind: "quiz", qIndex: 0, question: "Q?", events };
}

describe("scheduleOne", () => {
  it("沒練過：今天到期", () => {
    const s = scheduleOne([], NOW);
    expect(s.nextDueAt).toBe(NOW);
    expect(s.streak).toBe(0);
  });
  it("答對一次：間隔 3 天（streak=1 走 STEPS[1]）", () => {
    const at = NOW - DAY;
    const s = scheduleOne([{ correct: true, confidence: "med", at }], NOW);
    expect(s.intervalDays).toBe(3);
    expect(s.nextDueAt).toBe(at + 3 * DAY);
  });
  it("答錯：歸零明天回來；高信心答錯當天回來", () => {
    const at = NOW - DAY;
    const normal = scheduleOne([{ correct: false, confidence: "med", at }], NOW);
    expect(normal.intervalDays).toBe(1);
    const hard = scheduleOne([{ correct: false, confidence: "high", at }], NOW);
    expect(hard.intervalDays).toBe(0);
    expect(hard.nextDueAt).toBe(at);
  });
  it("低信心答對：間隔折半", () => {
    const at = NOW - DAY;
    const low = scheduleOne([{ correct: true, confidence: "low", at }], NOW);
    const med = scheduleOne([{ correct: true, confidence: "med", at }], NOW);
    expect(low.intervalDays).toBeLessThan(med.intervalDays);
  });
  it("連對拉長：streak 越長間隔越大且 70 封頂", () => {
    const mk = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ correct: true, confidence: "med" as const, at: NOW - (n - i) * DAY }));
    const s3 = scheduleOne(mk(3), NOW);
    const s6 = scheduleOne(mk(6), NOW);
    expect(s6.intervalDays).toBeGreaterThanOrEqual(s3.intervalDays);
    expect(scheduleOne(mk(50), NOW).intervalDays).toBe(70);
  });
});

describe("scheduleSm2：四檔（Again/Hard/Good/Easy）", () => {
  it("Again：interval≈10 分鐘（10/1440 天）、streak 歸零、lapses+1、ease-0.2", () => {
    const s = scheduleSm2({ intervalDays: 30, ease: 2.5, streak: 4, lapses: 1, reviewCount: 9 }, "again", NOW);
    // 斷言意圖（10 分鐘級），不寫死 rounding 後的 0.007：改 rounding 策略時這裡不該整片紅。
    expect(s.intervalDays).toBeCloseTo(10 / 1440, 3);
    expect(s.streak).toBe(0);
    expect(s.lapses).toBe(2);
    expect(s.ease).toBeCloseTo(2.3, 10);
    expect(s.reviewCount).toBe(10);
    expect(s.nextDueAt).toBe(NOW + s.intervalDays * DAY);
    expect(s.nextDueAt).toBeGreaterThan(NOW + 9 * 60_000);
    expect(s.nextDueAt).toBeLessThan(NOW + 11 * 60_000);
  });
  it("Hard：interval×1.2（最少 1 天）、streak 歸零、ease-0.15", () => {
    const long = scheduleSm2({ intervalDays: 10, ease: 2.5, streak: 3, lapses: 0, reviewCount: 3 }, "hard", NOW);
    expect(long.intervalDays).toBeCloseTo(12, 10);
    expect(long.streak).toBe(0);
    expect(long.ease).toBeCloseTo(2.35, 10);
    // 冷啟動/短間隔：×1.2 後仍不足 1 天 → 地板 1 天
    const cold = scheduleSm2({}, "hard", NOW);
    expect(cold.intervalDays).toBeCloseTo(1.2, 10);
    const tiny = scheduleSm2({ intervalDays: 0.2, ease: 2.5, reviewCount: 1 }, "hard", NOW);
    expect(tiny.intervalDays).toBe(1);
    expect(tiny.nextDueAt).toBe(NOW + DAY);
  });
  it("Good：interval<=1 或無 reviewCount 時 3 天起，否則 ×ease", () => {
    const cold = scheduleSm2({}, "good", NOW);
    expect(cold.intervalDays).toBe(3);
    expect(cold.streak).toBe(1);
    expect(cold.reviewCount).toBe(1);
    expect(cold.ease).toBeCloseTo(2.5, 10);
    // interval<=1 就算有 reviewCount 也回 3 天
    const short = scheduleSm2({ intervalDays: 1, ease: 2.5, reviewCount: 5 }, "good", NOW);
    expect(short.intervalDays).toBe(3);
    // 無 reviewCount（舊卡）視同冷啟動
    const legacy = scheduleSm2({ intervalDays: 5, ease: 2.5 }, "good", NOW);
    expect(legacy.intervalDays).toBe(3);
    // 正常增量：×ease
    const grown = scheduleSm2({ intervalDays: 7.5, ease: 2.5, streak: 2, reviewCount: 2 }, "good", NOW);
    expect(grown.intervalDays).toBeCloseTo(18.75, 10);
    expect(grown.streak).toBe(3);
    expect(grown.ease).toBeCloseTo(2.5, 10);
  });
  it("Easy：Good 的基礎再 ×1.3、ease+0.15", () => {
    const cold = scheduleSm2({}, "easy", NOW);
    expect(cold.intervalDays).toBeCloseTo(3.9, 10); // 3 × 1.3
    expect(cold.ease).toBeCloseTo(2.65, 10);
    expect(cold.streak).toBe(1);
    const grown = scheduleSm2({ intervalDays: 10, ease: 2.5, streak: 1, reviewCount: 4 }, "easy", NOW);
    expect(grown.intervalDays).toBeCloseTo(32.5, 10); // 10 × 2.5 × 1.3
    expect(grown.ease).toBeCloseTo(2.65, 10);
    expect(grown.streak).toBe(2);
  });
  it("ease 邊界：下限 1.3、上限 3.0", () => {
    const floor = scheduleSm2({ ease: 1.4 }, "again", NOW);
    expect(floor.ease).toBeCloseTo(1.3, 10);
    const floor2 = scheduleSm2({ ease: 1.3 }, "hard", NOW);
    expect(floor2.ease).toBeCloseTo(1.3, 10);
    const ceil = scheduleSm2({ ease: 2.95 }, "easy", NOW);
    expect(ceil.ease).toBeCloseTo(3.0, 10);
    // 連續 Again 不會跌破 1.3
    let st = { ease: 2.5 };
    for (let i = 0; i < 10; i++) st = scheduleSm2(st, "again", NOW);
    expect(st.ease).toBeCloseTo(1.3, 10);
  });
  it("interval 上限 365 天、保留 3 位小數", () => {
    const capped = scheduleSm2({ intervalDays: 300, ease: 2.5, reviewCount: 1 }, "good", NOW);
    expect(capped.intervalDays).toBe(365);
    expect(capped.nextDueAt).toBe(NOW + 365 * DAY);
    const rounded = scheduleSm2({ intervalDays: 1.111, ease: 2.5, reviewCount: 1 }, "good", NOW);
    expect(rounded.intervalDays).toBe(2.778); // 2.7775 → 取 3 位
  });
  it("未知 rating 直接拋錯（不默默回傳）", () => {
    expect(() => scheduleSm2({}, "unknown" as never, NOW)).toThrow();
  });
});

describe("ratingOf：confidence×對錯 六組映射", () => {
  it("high+對=Easy、high+錯=Again", () => {
    expect(ratingOf(true, "high")).toBe("easy");
    expect(ratingOf(false, "high")).toBe("again");
  });
  it("med+對=Good、med+錯=Hard", () => {
    expect(ratingOf(true, "med")).toBe("good");
    expect(ratingOf(false, "med")).toBe("hard");
  });
  it("low+對=Hard、low+錯=Again", () => {
    expect(ratingOf(true, "low")).toBe("hard");
    expect(ratingOf(false, "low")).toBe("again");
  });
});

describe("replaySm2：歷史重播（舊卡遷移用）", () => {
  it("空陣列回 null（呼叫方建冷卡）", () => {
    expect(replaySm2([])).toBeNull();
  });
  it("多筆歷史逐步重播：Good 連兩次 3 → 7.5 天", () => {
    const t1 = NOW - 20 * DAY;
    const t2 = NOW - 10 * DAY;
    const s = replaySm2([
      { correct: true, confidence: "med", at: t1 },
      { correct: true, confidence: "med", at: t2 },
    ]);
    expect(s).not.toBeNull();
    expect(s!.intervalDays).toBeCloseTo(7.5, 10);
    expect(s!.streak).toBe(2);
    expect(s!.reviewCount).toBe(2);
    expect(s!.ease).toBeCloseTo(2.5, 10);
    // 每一步用該次作答時間當 now → 到期日落在最後一次作答之後
    expect(s!.nextDueAt).toBe(t2 + 7.5 * DAY);
    expect(s!.nextDueAt).toBeGreaterThan(t2);
  });
  it("混錯題：Again 重置 streak/lapses，後續再算", () => {
    const t1 = NOW - 30 * DAY;
    const t2 = NOW - 20 * DAY;
    const t3 = NOW - 10 * DAY;
    const s = replaySm2([
      { correct: true, confidence: "high", at: t1 }, // Easy: 3.9 天, ease 2.65, streak 1
      { correct: false, confidence: "high", at: t2 }, // Again: 10 分鐘, ease 2.45, lapses 1
      { correct: true, confidence: "low", at: t3 }, // Hard: 10/1440×1.2 ≈ 0.0083 → 最少 1 天
    ]);
    expect(s).not.toBeNull();
    expect(s!.streak).toBe(0);
    expect(s!.lapses).toBe(1);
    expect(s!.ease).toBeCloseTo(2.3, 10);
    expect(s!.reviewCount).toBe(3);
    expect(s!.intervalDays).toBe(1);
    expect(s!.nextDueAt).toBe(t3 + DAY);
  });
});

describe("computeDue", () => {
  it("未到期不回；到期按 priority 降序（高信心錯最先）", () => {
    const items = [
      item([{ correct: true, confidence: "med", at: NOW - DAY }]), // 間隔3天，還沒到期
      item([{ correct: false, confidence: "high", at: NOW - DAY }]), // 當天回來，已逾期
      item([]), // 新題
    ];
    const due = computeDue(items, NOW);
    expect(due.length).toBe(2);
    expect(due[0].reason).toContain("很有把握");
    expect(due[1].reason).toContain("還沒練過");
  });
  it("空輸入回空陣列", () => {
    expect(computeDue([], NOW)).toEqual([]);
  });
});
