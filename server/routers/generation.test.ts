import { describe, expect, it } from "vitest";
import { parseConflicts, parseDialogue, sanitizeItems } from "./generation";
import { splitChunks } from "../podcast";

describe("sanitizeItems", () => {
  it("閃卡：丟掉 front 空的、back 缺失補空字串", () => {
    const out = sanitizeItems("flashcards", [
      { front: "Q1", back: "A1" },
      { front: "  ", back: "x" },
      { front: "Q2" },
    ]) as { front: string; back: string }[];
    expect(out).toEqual([
      { front: "Q1", back: "A1" },
      { front: "Q2", back: "" },
    ]);
  });
  it("測驗：選項不足2丟掉、answer 越界夾住（F-1 不再存永遠答不對的題）", () => {
    const out = sanitizeItems("quiz", [
      { question: "Q?", options: ["a", "b", "c"], answer: 9 },
      { question: "爛題", options: ["only"] },
      { question: "", options: ["a", "b"] },
    ]) as { question: string; options: string[]; answer: number }[];
    expect(out.length).toBe(1);
    expect(out[0].answer).toBe(2); // clamp 到最後一個合法索引
  });
});

describe("parseConflicts", () => {
  it("只抽 ⚠️ 衝突：行", () => {
    const text = `[{"a":1}]\n⚠️ 衝突：A 說甲，B 說乙\n普通文字\n⚠️ 衝突：第二條`;
    expect(parseConflicts(text)).toEqual(["A 說甲，B 說乙", "第二條"]);
  });
  it("沒有衝突回空陣列", () => {
    expect(parseConflicts(`[{"a":1}]`)).toEqual([]);
  });
});

describe("parseDialogue", () => {
  it("非法 speaker/空 text 丟掉、單句 600 封頂", () => {
    const raw = JSON.stringify([
      { speaker: "A", text: "你好" },
      { speaker: "X", text: "壞的" },
      { speaker: "B", text: "" },
      { speaker: "B", text: "y".repeat(700) },
    ]);
    const lines = parseDialogue(raw);
    expect(lines.map((l) => l.speaker)).toEqual(["A", "B"]);
    expect(lines[1].text.length).toBe(600);
  });
  it("非 JSON 回空陣列（上層轉人話錯誤）", () => {
    expect(parseDialogue("這不是 JSON")).toEqual([]);
  });
});

describe("splitChunks", () => {
  it("短文字不切", () => {
    expect(splitChunks("hello")).toEqual(["hello"]);
  });
  it("長文按標點優先切、多塊皆非空", () => {
    const text = "第一句。第二句！第三句？第四句；第5句。結尾。" + "很長。".repeat(200);
    const chunks = splitChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length > 0)).toBe(true);
    expect(chunks.join("")).toBe(text);
  });
});
