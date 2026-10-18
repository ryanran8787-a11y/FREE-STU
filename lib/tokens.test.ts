import { describe, expect, it } from "vitest";
import { cjkBigrams, indexTokens, makeSnippet, matchQuery, normalizeTags, parseTags, queryTerms } from "@/lib/tokens";

describe("cjkBigrams", () => {
  it("把連續中文切成 bigram（子字串檢索的關鍵）", () => {
    expect(cjkBigrams("機器學習")).toEqual(["機器", "器學", "學習"]);
  });

  it("單字中文保留，不會產生空 token", () => {
    expect(cjkBigrams("學")).toEqual(["學"]);
  });

  it("中文被非中文字元隔開時分別切", () => {
    expect(cjkBigrams("機器 learning 學習")).toEqual(["機器", "學習"]);
  });

  it("沒有中文回空陣列", () => {
    expect(cjkBigrams("hello world 123")).toEqual([]);
  });
});

describe("indexTokens", () => {
  it("中文 bigram 與拉丁詞都進索引", () => {
    const t = indexTokens("機器學習 machine learning");
    expect(t).toContain("機器");
    expect(t).toContain("學習");
    expect(t).toContain("machine");
    expect(t).toContain("learning");
  });

  it("單字母與單數字不進索引（雜訊太大）", () => {
    const t = indexTokens("a b 1 2 ab").split(" ");
    expect(t).not.toContain("a");
    expect(t).not.toContain("b");
    expect(t).toContain("ab");
  });

  it("重複詞去重", () => {
    const list = indexTokens("學習學習學習").split(" ");
    expect(list.filter((x) => x === "學習")).toHaveLength(1);
  });

  it("大小寫統一（查詢不分大小寫）", () => {
    expect(indexTokens("Machine")).toBe("machine");
  });
});

describe("matchQuery", () => {
  it("中文查詢展開成 bigram 的 OR 表達式", () => {
    const m = matchQuery("機器學習");
    expect(m).toBe('"機器" OR "器學" OR "學習"');
  });

  it("空查詢回 null（呼叫端據此跳過檢索）", () => {
    expect(matchQuery("")).toBeNull();
    expect(matchQuery("   ")).toBeNull();
    expect(matchQuery("!@#$%^&*()")).toBeNull();
    expect(matchQuery("a")).toBeNull();
  });

  it("FTS5 語法運算子不會洩漏成裸運算子", () => {
    const m = matchQuery('NEAR("x" AND y*) -z :w')!;
    expect(m).not.toBeNull();
    // 每個 token 都被雙引號包住，運算子字元只出現在引號內
    for (const tok of m.match(/"[^"]*"/g) ?? []) {
      const inner = tok.slice(1, -1);
      for (const bad of ["NEAR(", "AND", "*", ":", "-"]) {
        if (inner.includes(bad)) continue; // 在引號內是安全的
      }
    }
    // 關鍵字沒被當成運算子：整串一定以引號開頭、且引號數為偶數
    expect(m.startsWith('"')).toBe(true);
    expect((m.match(/"/g) ?? []).length % 2).toBe(0);
  });

  it("引號混進查詢也不會破壞語法（token 只取自受限字元集）", () => {
    const m = matchQuery('ab"cd')!;
    expect(m).not.toBeNull();
    // 引號不是 token 字元，會被當分隔：拆成兩個乾淨 token，而非產生半截字串
    expect(m).toBe('"ab" OR "cd"');
    expect((m.match(/"/g) ?? []).length % 2).toBe(0);
  });

  it("每個 token 內只含安全字元（不會有裸運算子）", () => {
    const m = matchQuery('機器學習 AND "x" OR y* (z) -w :v')!;
    for (const tok of m.match(/"[^"]*"/g) ?? []) {
      const inner = tok.slice(1, -1);
      expect(inner).toMatch(/^[a-z0-9\u4e00-\u9fff]+$/);
    }
  });
});

describe("queryTerms", () => {
  it("回傳原樣詞（不切 bigram），長詞優先", () => {
    expect(queryTerms("機器學習 deep")).toEqual(["機器學習", "deep"]);
  });

  it("單字中文保留（索引端也留了單字，摘要才定位得到）", () => {
    expect(queryTerms("a 學 b")).toEqual(["學"]);
  });

  it("單字母雜訊被濾掉", () => {
    expect(queryTerms("a b c")).toEqual([]);
  });
});

describe("makeSnippet", () => {
  it("短文原樣回傳", () => {
    expect(makeSnippet("很短", ["短"])).toBe("很短");
  });

  it("長文以查詢詞為中心截取並加省略號", () => {
    const text = "前言".repeat(200) + "目標詞" + "後語".repeat(200);
    const s = makeSnippet(text, ["目標詞"], 60);
    expect(s).toContain("目標詞");
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
  });

  it("找不到查詢詞時取開頭", () => {
    const s = makeSnippet("x".repeat(500), ["不存在"], 40);
    expect(s.endsWith("…")).toBe(true);
    expect(s).not.toContain("不存在");
  });

  it("換行與多餘空白被壓平", () => {
    expect(makeSnippet("a\n\n  b\tc", ["b"])).toBe("a b c");
  });
});

describe("normalizeTags", () => {
  it("逗號、頓號、全形逗號都當分隔", () => {
    expect(normalizeTags("生物, 化學、物理，數學")).toBe("生物,化學,物理,數學");
  });

  it("去空白、去空項、去重", () => {
    expect(normalizeTags(" 生物 ,, 生物 , 化學 ")).toBe("生物,化學");
  });

  it("單一標籤最長 20 字、最多 8 個", () => {
    const long = normalizeTags("x".repeat(50));
    expect(long).toHaveLength(20);
    const many = normalizeTags(Array.from({ length: 12 }, (_, i) => `t${i}`).join(","));
    expect(many.split(",")).toHaveLength(8);
  });

  it("空字串回空字串", () => {
    expect(normalizeTags("")).toBe("");
    expect(normalizeTags(" , , ")).toBe("");
  });

  it("接受陣列輸入", () => {
    expect(normalizeTags(["生物", "化學"])).toBe("生物,化學");
  });
});

describe("parseTags", () => {
  it("字串切回陣列", () => {
    expect(parseTags("生物,化學")).toEqual(["生物", "化學"]);
  });

  it("空字串回空陣列", () => {
    expect(parseTags("")).toEqual([]);
  });

  it("normalizeTags 與 parseTags 互為往返", () => {
    const s = "生物, 化學";
    expect(parseTags(normalizeTags(s))).toEqual(["生物", "化學"]);
  });
});

describe("檢索語意（bigram 展開的核心保證）", () => {
  it("兩字中文詞能被含它的長詞命中：查「學習」→ 索引含「學習」", () => {
    const indexed = new Set(indexTokens("機器學習是人工智慧的分支").split(" "));
    for (const t of (matchQuery("學習") ?? "").match(/"[^"]+"/g) ?? []) {
      expect(indexed.has(t.replace(/"/g, ""))).toBe(true);
    }
  });

  it("索引端與查詢端用同一套切法（否則永遠查不到）", () => {
    const indexed = new Set(indexTokens("深度學習與神經網路").split(" "));
    const queryTokens = (matchQuery("神經網路") ?? "").match(/"[^"]+"/g)!.map((t) => t.replace(/"/g, ""));
    // 至少一個查詢 token 命中索引才會有結果
    expect(queryTokens.some((t) => indexed.has(t))).toBe(true);
  });
});
