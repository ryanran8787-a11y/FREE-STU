// B1 測試 seam：planDueAt(dayIndex, now) 純函數＋qIndex 編碼。
// 零時區地雷：due 一律用「本地 08:00」，不碰 UTC 換算。
import { describe, expect, it } from "vitest";
import { planDueAt, planQIndex } from "@/server/plan/due";

describe("planDueAt", () => {
  it("dayIndex 0 = 今天本地 08:00（即使現在已過 08:00，照樣算今天，進 queue 即到期）", () => {
    const now = new Date(2026, 9, 18, 15, 30).getTime(); // 本地 10/18 15:30
    const d = planDueAt(0, now);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(18);
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
  });

  it("dayIndex 2 = 兩天後本地 08:00", () => {
    const now = new Date(2026, 9, 18, 15, 30).getTime();
    const d = planDueAt(2, now);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(8);
  });

  it("跨月進位正確", () => {
    const now = new Date(2026, 9, 31, 9, 0).getTime(); // 10/31
    const d = planDueAt(1, now);
    expect(d.getMonth()).toBe(10); // 11月
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(8);
  });
});

describe("planQIndex", () => {
  it("day(1-based)*100+taskIndex，第1天第0個任務 = 0", () => {
    expect(planQIndex(1, 0)).toBe(0);
    expect(planQIndex(1, 3)).toBe(3);
    expect(planQIndex(2, 1)).toBe(101);
    expect(planQIndex(7, 2)).toBe(602);
  });
});
