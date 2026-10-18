import { describe, expect, it } from "vitest";
import { computeDue, scheduleOne, type QueueItemInput } from "./queue";

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
