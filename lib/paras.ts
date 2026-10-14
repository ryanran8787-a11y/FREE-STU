// 段落切分：前後端共用，同一份 rawText 永遠切出同一組 ID。
// ID 形如 p0, p1…（note 內唯一）。心智圖來源映射就掛在這些 ID 上。

export type Para = { id: string; text: string };

export function splitParagraphs(rawText: string): Para[] {
  const text = rawText.replace(/\r/g, "").trim();
  if (!text) return [];
  let chunks = text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (chunks.length < 3) {
    chunks = text
      .split(/\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return chunks.map((t, i) => ({ id: `p${i}`, text: t }));
}

/** 取前 N 字內的段落（傳給 LLM 用，保證 ID 穩定：永遠從 p0 開始取） */
export function headParagraphs(rawText: string, maxChars = 12000): Para[] {
  const paras = splitParagraphs(rawText);
  const out: Para[] = [];
  let used = 0;
  for (const p of paras) {
    if (used + p.text.length > maxChars && out.length > 0) break;
    out.push(p);
    used += p.text.length;
  }
  return out;
}

/** 心智圖後處理：抽標題末的 [p1,p5] / [p6-p7] 引用，驗 ID 合法性，strip 後回傳乾淨 md + 映射 */
export function extractSourceMap(
  md: string,
  validIds: Set<string>,
): { cleaned: string; sourceMap: Record<string, string[]> } {
  const sourceMap: Record<string, string[]> = {};
  const cleaned = md
    .split("\n")
    .map((line) => {
      const m = line.match(/^(#{1,6}\s+)(.*?)(\s*\[([pP]?\d+(?:\s*[-,]\s*[pP]?\d+)*)\])\s*$/);
      if (!m) return line;
      const title = m[2].trim();
      const ids: string[] = [];
      for (const part of m[4].split(",")) {
        const range = part.trim().match(/^[pP]?(\d+)\s*-\s*[pP]?(\d+)$/);
        if (range) {
          let a = parseInt(range[1], 10);
          let b = parseInt(range[2], 10);
          if (a > b) [a, b] = [b, a];
          for (let n = a; n <= b && ids.length < 50; n++) ids.push(`p${n}`);
        } else {
          const num = part.trim().match(/^[pP]?(\d+)$/);
          if (num) ids.push(`p${num[1]}`);
        }
      }
      const valid = [...new Set(ids.filter((id) => validIds.has(id)))];
      if (valid.length > 0) sourceMap[title] = valid;
      return `${m[1]}${title}`;
    })
    .join("\n");
  return { cleaned, sourceMap };
}
