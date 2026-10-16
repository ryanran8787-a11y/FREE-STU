// 自訂 Prompt：三層制（簡易選項 / 範本 / 完整編輯器）共用的變數渲染。
// 輸出不做格式驗證（自由模板），原樣當 Markdown 顯示。

export const CUSTOM_VARS = ["note", "paras", "focus", "count", "difficulty", "language"] as const;

export type CustomVarValues = {
  note: string;
  paras: string;
  focus: string;
  count: number | null;
  difficulty: string;
  language: string;
};

/** 渲染 {{變數}}。未知變數直接丟錯（執行前攔下，附可用清單）。 */
export function renderCustomPrompt(body: string, v: CustomVarValues): string {
  const unknown = new Set<string>();
  const out = body.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (m, name: string) => {
    switch (name) {
      case "note":
        return v.note;
      case "paras":
        return v.paras;
      case "focus":
        // 空聚焦就不留痕跡，有就包成一句附註（範本裡可直接裸放 {{focus}}）
        return v.focus.trim() ? `（主題聚焦：${v.focus.trim().slice(0, 500)}）` : "";
      case "count":
        return v.count === null ? "" : String(v.count);
      case "difficulty":
        return v.difficulty;
      case "language":
        return v.language;
      default:
        unknown.add(name);
        return m;
    }
  });
  if (unknown.size > 0) {
    throw new Error(`未知變數 {{${[...unknown].join("}}、{{")}}}}\n可用：${CUSTOM_VARS.map((x) => `{{${x}}}`).join("、")}`);
  }
  return out;
}

export type SimpleMethod = "explain" | "points" | "table" | "story";
export type SimpleLength = "short" | "standard" | "long";

export const SIMPLE_METHODS: Record<SimpleMethod, { label: string; frag: string }> = {
  explain: { label: "白話講解", frag: "用白話把概念講懂，少用術語，必要時打比方" },
  points: { label: "條列重點", frag: "整理成條列重點，每條一句話，抓關鍵字" },
  table: { label: "表格整理", frag: "整理成 Markdown 表格對照（概念｜說明｜例子），方便一眼比較" },
  story: { label: "故事記憶", frag: "編成好記的小故事或口訣幫我記住，考點要藏在故事裡" },
};

export const SIMPLE_LENGTHS: Record<SimpleLength, { label: string; frag: string }> = {
  short: { label: "簡短", frag: "300 字以內，説重點就好" },
  standard: { label: "標準", frag: "800 字左右，完整但不囉嗦" },
  long: { label: "詳細", frag: "1500 字左右，深挖細節和例子" },
};

/** 第一層：選項組裝成完整 prompt（回傳給 LLM 的全文，不含筆記） */
export function buildSimplePrompt(
  method: SimpleMethod,
  length: SimpleLength,
  hintFirst: boolean,
  lang: string,
  focus: string,
): string {
  const m = SIMPLE_METHODS[method] ?? SIMPLE_METHODS.explain;
  const l = SIMPLE_LENGTHS[length] ?? SIMPLE_LENGTHS.standard;
  const f = focus.trim() ? `\n主題聚焦：${focus.trim().slice(0, 500)}（優先圍繞這個主題）` : "";
  const hint = hintFirst
    ? "\n結構要求：先給提示和思考方向，把答案和解析收在最後的「答案公布」區，不要一開始就破梗。"
    : "";
  return `你是學習助教。根據以下筆記，${m.frag}，${l.frag}，用${lang}回答，只回傳 Markdown，不要程式碼圍欄。${hint}${f}\n\n`;
}

export type BuiltinTemplate = { id: string; name: string; desc: string; body: string };

/** 第二層：內建範本（唯讀，可一鍵複製成我的模板再改） */
export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: "socratic",
    name: "蘇格拉底式提問",
    desc: "連續追問引導思考，答案收在最後",
    body: `你是蘇格拉底。根據以下筆記，用{{language}}設計 5 到 8 個層層深入的提問，每題附一句思考方向，{{difficulty}}難度。不要直接給答案，把完整解答收在最後的「答案與解析」區。只回傳 Markdown。{{focus}}\n\n{{note}}`,
  },
  {
    id: "feynman",
    name: "費曼學習法",
    desc: "白話＋生活例子，最後自測三題",
    body: `你是費曼。用{{language}}把以下筆記講到連國中生都懂：每個概念配一個生活例子，{{difficulty}}難度。最後出 3 題自測（附答案）。只回傳 Markdown。{{focus}}\n\n{{note}}`,
  },
  {
    id: "exam",
    name: "考前衝刺",
    desc: "必考重點＋陷阱＋速記表",
    body: `你是考前衝刺教練。根據以下筆記，用{{language}}整理：必考重點條列、易錯陷阱提醒、一頁速記表。{{difficulty}}難度，只回傳 Markdown。{{focus}}\n\n{{note}}`,
  },
];
