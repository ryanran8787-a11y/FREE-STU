// 中文檢索的斷詞層（純函數，前後端與測試共用）。
//
// 為什麼要自己斷詞：FTS5 內建分詞器對中文都不合用——
//   unicode61 把整串中文當「一個」token，查「學習」命中不了「機器學習」；
//   trigram 要查詢 ≥3 字才命中，兩字中文詞（本專案最常見的查詢長度）全滅。
// 所以在寫入索引前先把連續中文切成 bigram（「機器學習」→ 機器/器學/學習），
// 查詢端用同一套切法展開，FTS5 就能用 unicode61 精準命中 2 字以上的中文詞，
// 且天然支援子字串檢索（查「學習」命中「機器學習」）。

const CJK_RUN = /[\u4e00-\u9fff]+/g;
const LATIN_WORD = /[a-z0-9]+/g;
/** 單篇上限：超長筆記的 bigram 量很大，寧可截斷也不要拖垮索引。 */
const MAX_TOKENS = 6000;

/** 連續中文切成 bigram；長度 1 的中文段保留單字（查單字仍可命中）。 */
export function cjkBigrams(text: string): string[] {
  const out: string[] = [];
  for (const run of text.match(CJK_RUN) ?? []) {
    if (run.length === 1) {
      out.push(run);
      continue;
    }
    for (let i = 0; i + 1 < run.length; i++) out.push(run.slice(i, i + 2));
  }
  return out;
}

/** 索引用 token 串：拉丁詞（≥2 字）＋ 中文 bigram，去重後以空白連接。 */
export function indexTokens(text: string): string {
  const set = new Set<string>();
  for (const w of text.toLowerCase().match(LATIN_WORD) ?? []) {
    if (w.length >= 2) set.add(w);
  }
  for (const b of cjkBigrams(text)) set.add(b);
  return [...set].slice(0, MAX_TOKENS).join(" ");
}

/**
 * 查詢 → FTS5 MATCH 表達式（token 之間 OR）。
 * 每個 token 都包成字串常值並逃逸雙引號，使用者亂打 `*` `(` `:` `AND` `-` 都不會造成語法錯誤。
 * 沒有可用 token 時回 null，呼叫端據此跳過檢索。
 */
export function matchQuery(query: string): string | null {
  const set = new Set<string>();
  for (const w of query.toLowerCase().match(LATIN_WORD) ?? []) {
    if (w.length >= 2) set.add(w);
  }
  for (const b of cjkBigrams(query)) set.add(b);
  if (set.size === 0) return null;
  return [...set].map((t) => `"${t.replace(/"/g, '""')}"`).join(" OR ");
}

/**
 * 查詢的「原樣」詞彙（不展開成 bigram），給摘要與前端高亮用。
 * 排序：長詞優先（避免「機器學習」被「機器」先切走），同長度時中文優先，最後字典序——
 * 全是為了結果穩定可測，不依賴 Set 的插入順序。
 */
export function queryTerms(query: string): string[] {
  const set = new Set<string>();
  for (const w of query.toLowerCase().match(LATIN_WORD) ?? []) {
    if (w.length >= 2) set.add(w);
  }
  // 單字中文也收：索引端 cjkBigrams 保留了單字，查詢端不收會導致摘要定位不到詞
  for (const run of query.match(CJK_RUN) ?? []) {
    set.add(run);
  }
  return [...set].sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const aCjk = /[\u4e00-\u9fff]/.test(a);
    const bCjk = /[\u4e00-\u9fff]/.test(b);
    if (aCjk !== bCjk) return aCjk ? -1 : 1;
    return a.localeCompare(b);
  });
}

/** 從原文取一段含查詢詞的摘要（純文字，前端自行高亮）；找不到詞就取開頭。 */
export function makeSnippet(text: string, terms: string[], width = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= width) return flat;
  const low = flat.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = low.indexOf(t.toLowerCase());
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return `${flat.slice(0, width)}…`;
  const start = Math.max(0, at - Math.floor(width / 3));
  const end = Math.min(flat.length, start + width);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

/** 標籤正規化：逗號/頓號分隔 → 去空白、去重、去空、限長限數。 */
export function normalizeTags(input: string | string[]): string {
  const raw = Array.isArray(input) ? input : input.split(/[,，、]/);
  const out: string[] = [];
  for (const t of raw) {
    const v = t.trim().replace(/[,，、]/g, "").slice(0, 20);
    if (!v || out.includes(v)) continue;
    out.push(v);
    if (out.length >= 8) break;
  }
  return out.join(",");
}

/** 標籤字串 → 陣列（前端顯示用）。 */
export function parseTags(tags: string): string[] {
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
