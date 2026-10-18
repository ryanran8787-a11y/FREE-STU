import type { GenOptions } from "./options";
import { DIFF_WORDS, LANG_WORDS } from "./options";

export function buildPrompt(type: "flashcards" | "quiz" | "mindmap", o: GenOptions, n: number | null): string {
  const lang = LANG_WORDS[o.language];
  const focus = o.focus.trim() ? `\n主題聚焦：${o.focus.trim().slice(0, 500)}（優先圍繞這個主題出題）` : "";
  if (type === "mindmap") {
    const depth = o.count === "less" ? "精簡（最多2層、每層不超過4個分支）" : o.count === "more" ? "詳盡（3-4層、多分支、全覆蓋）" : "標準（3層、每層3-6個分支）";
    return `你是學習助教。根據以下編號段落產生一份${lang}心智圖大綱，${depth}，難度${DIFF_WORDS[o.difficulty]}。只回傳 Markdown（# 主題、## 分支、### 葉節點），不要程式碼圍欄、不要其他文字。重要：每個 ## / ### 標題末尾必須標註它依據的段落編號，形如「## 監護宣告 [p3,p7]」或區間「## 行為能力 [p6-p7]」，編號只能用下面給出的，未依據任何段落就不要標：${focus}\n\n`;
  }
  const count = n ?? 5;
  if (type === "flashcards") {
    return `你是學習助教。根據以下筆記產生 ${count} 張${lang}閃卡，難度${DIFF_WORDS[o.difficulty]}，只回傳 JSON 陣列，每個元素 {front, back}，不要其他文字：${focus}

若筆記內有互相矛盾的敘述，請在 JSON 陣列之後另起一行寫「⚠️ 衝突：A 說…，B 說…」，一行一個，沒有就不要寫。\n\n`;
  }
  if (type === "quiz") {
    return `你是學習助教。根據以下筆記產生 ${count} 題${lang}單選測驗，難度${DIFF_WORDS[o.difficulty]}，只回傳 JSON 陣列，每個元素 {question, options(4個字串，不要加A/B/C/D編號), answer(正確選項的索引0-3), explanation(為什麼正確、一兩句話${lang})}，不要其他文字：${focus}

若筆記內有互相矛盾的敘述，請在 JSON 陣列之後另起一行寫「⚠️ 衝突：A 說…，B 說…」，一行一個，沒有就不要寫。\n\n`;
  }
  return "";
}

export function buildDialoguePrompt(lang: string, focus: string): string {
  const f = focus.trim() ? `\n主題聚焦：${focus.trim().slice(0, 500)}（優先圍繞這個主題聊）` : "";
  return `你是播客編劇。根據以下筆記寫一段${lang}雙人對談逐字稿：A 是主持人（提問、串場、幫聽眾總結），B 是講解者（用人話講清楚概念，可以舉例）。10 到 16 輪，兩人輪流發言，每句 150 字以內，總長 2000 字以內，口語、不要書面腔，不要開場白以外的廢話。只回傳 JSON 陣列，每個元素 {speaker（只能是 "A" 或 "B"）, text}，不要其他文字：${f}\n\n`;
}
