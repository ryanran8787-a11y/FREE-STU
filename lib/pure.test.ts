import { describe, expect, it } from "vitest";
import { flashcardCount, quizCount } from "./counts";
import { gradeQuiz, parseQuizItems, stripQuizForInteract } from "./quiz";
import { headParagraphs, splitParagraphs, extractSourceMap } from "./paras";
import { searchNotes, tokenize } from "./retrieval";
import { deleteNodeFromMd, parseHeadings, renameNodeInMd } from "./mindmap";

describe("counts", () => {
  it("閃卡：字數越多越多，最少 3、最多 12（標準）", () => {
    expect(flashcardCount(0, "standard")).toBe(3);
    expect(flashcardCount(1800, "standard")).toBe(3);
    expect(flashcardCount(3600, "standard")).toBe(6);
    expect(flashcardCount(100000, "standard")).toBe(12);
  });
  it("測驗：標準每千字一題，封頂 10", () => {
    expect(quizCount(0, "standard")).toBe(3);
    expect(quizCount(5000, "standard")).toBe(5);
    expect(quizCount(100000, "standard")).toBe(10);
  });
  it("less/more 檔位有不同縮放", () => {
    expect(flashcardCount(6000, "less")).toBeLessThan(flashcardCount(6000, "standard"));
    expect(flashcardCount(6000, "more")).toBeGreaterThan(flashcardCount(6000, "standard"));
  });
});

describe("quiz（Top-1 卡片協議）", () => {
  const items = [
    { question: "Q1", options: ["a", "b", "c"], answer: 0, explanation: "解1" },
    { question: "Q2", options: ["a", "b"], answer: 1 },
  ];
  it("strip 去 answer/explanation，只留 question/options", () => {
    expect(stripQuizForInteract(items)).toEqual([
      { question: "Q1", options: ["a", "b", "c"] },
      { question: "Q2", options: ["a", "b"] },
    ]);
    expect(JSON.stringify(stripQuizForInteract(items))).not.toContain("answer");
  });
  it("grade 精確匹配；越界 fail-closed", () => {
    expect(gradeQuiz(items, 0, 0)).toEqual({ correct: true, answer: 0 });
    expect(gradeQuiz(items, 0, 1)).toEqual({ correct: false, answer: 0 });
    expect(gradeQuiz(items, 99, 0)).toEqual({ correct: false, answer: -1 });
    expect(gradeQuiz(items, 0, 99)).toEqual({ correct: false, answer: 0 });
  });
  it("parse 髒資料回空陣列", () => {
    expect(parseQuizItems(null)).toEqual([]);
    expect(parseQuizItems("not json")).toEqual([]);
    expect(parseQuizItems("{}")).toEqual([]);
  });
});

describe("paras", () => {
  it("空字串回空陣列", () => {
    expect(splitParagraphs("")).toEqual([]);
    expect(splitParagraphs("  \n  ")).toEqual([]);
  });
  it("空行切段、ID 穩定 p0 起", () => {
    const ps = splitParagraphs("第一段\n\n第二段\n\n第三段");
    expect(ps.map((p) => p.id)).toEqual(["p0", "p1", "p2"]);
  });
  it("不足三段改按單行切", () => {
    const ps = splitParagraphs("a\nb");
    expect(ps.map((p) => p.id)).toEqual(["p0", "p1"]);
  });
  it("headParagraphs 永遠從 p0 取、不超過上限太多", () => {
    const raw = ["a".repeat(100), "b".repeat(100), "c".repeat(100)].join("\n\n");
    const head = headParagraphs(raw, 150);
    expect(head[0].id).toBe("p0");
    expect(head.length).toBeLessThan(3);
  });
  it("extractSourceMap：抽引用、驗 ID、strip", () => {
    const md = "# 主題\n## 分支A [p0,p1]\n## 分支B [p9]\n## 分支C [p0-p2]";
    const { cleaned, sourceMap } = extractSourceMap(md, new Set(["p0", "p1", "p2"]));
    expect(cleaned).not.toContain("[p0");
    expect(sourceMap["分支A"]).toEqual(["p0", "p1"]);
    expect(sourceMap["分支B"]).toBeUndefined(); // p9 非法
    expect(sourceMap["分支C"]).toEqual(["p0", "p1", "p2"]);
  });
});

describe("retrieval", () => {
  it("tokenize：英文≥2字母＋CJK bigram", () => {
    expect(tokenize("Hi AI 學習")).toContain("ai");
    expect(tokenize("機器學習")).toContain("機器");
    expect(tokenize("a")).toEqual([]);
  });
  it("searchNotes：命中段落、paraId 穩定", () => {
    const notes = [{ id: "n1", title: "民法", rawText: "行為能力\n\n監護宣告的要件" }];
    const hits = searchNotes(notes, "監護宣告", 6, 6000);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].paraId).toBe("p1");
  });
  it("空 query 回空", () => {
    expect(searchNotes([{ id: "n1", title: "t", rawText: "x" }], "", 6, 6000)).toEqual([]);
  });
});

describe("mindmap", () => {
  const md = "# 根\n## A\n### A1\n## B\n";
  it("parseHeadings 抓層級", () => {
    const nodes = parseHeadings(md);
    expect(nodes.map((n) => n.level)).toEqual([1, 2, 3, 2]);
  });
  it("改名只改該行", () => {
    const out = renameNodeInMd(md, "A", "甲");
    expect(out).toContain("## 甲");
    expect(out).toContain("## B");
  });
  it("改名不存在回 null", () => {
    expect(renameNodeInMd(md, "不存在", "x")).toBeNull();
  });
  it("刪節點連子樹一起刪、不刪根", () => {
    const out = deleteNodeFromMd(md, "A");
    expect(out).not.toContain("## A");
    expect(out).not.toContain("A1");
    expect(out).toContain("## B");
    expect(deleteNodeFromMd(md, "根")).toBeNull();
  });
});
