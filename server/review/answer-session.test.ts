// A1 answer-session 紅燈測試：pure next(due, result) → remaining。
// 規則：答對→移除；答錯→排到隊尾（本輪稍後再練）；空列→空列。
import { describe, expect, it } from "vitest";
import { next, type SessionCard } from "@/server/review/answer-session";

const c = (qIndex: number, genId = "g1"): SessionCard => ({ genId, qIndex });

describe("answer-session next()", () => {
  it("答對：該題從本輪移除", () => {
    const out = next([c(0), c(1), c(2)], { genId: "g1", qIndex: 1, correct: true });
    expect(out.map((x) => x.qIndex)).toEqual([0, 2]);
  });

  it("答錯：該題排到隊尾，本輪稍後再練", () => {
    const out = next([c(0), c(1), c(2)], { genId: "g1", qIndex: 0, correct: false });
    expect(out.map((x) => x.qIndex)).toEqual([1, 2, 0]);
  });

  it("同 genId+qIndex 才算同一題，不同 gen 不動", () => {
    const out = next([c(0, "g1"), c(0, "g2")], { genId: "g1", qIndex: 0, correct: true });
    expect(out).toEqual([c(0, "g2")]);
  });
});
