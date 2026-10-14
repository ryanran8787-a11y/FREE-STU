// 無向量庫的跨筆記檢索：關鍵字 TF + 標題加權，前後端無依賴的純函數。
// 引用編號 s1..sK（單次請求內唯一），與單筆記的 pN 區分。

export type NoteDoc = { id: string; title: string; rawText: string };
export type ScoredPara = { noteId: string; noteTitle: string; paraId: string; text: string; score: number };

export function tokenize(query: string): string[] {
  const terms = new Set<string>();
  for (const w of query.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (w.length >= 2) terms.add(w);
  }
  const cjk = query.replace(/[^\u4e00-\u9fff]/g, "");
  for (let i = 0; i + 1 < cjk.length; i++) {
    terms.add(cjk.slice(i, i + 2));
  }
  return [...terms];
}

function countOccur(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

export function searchNotes(
  notes: NoteDoc[],
  query: string,
  topK = 6,
  maxChars = 6000,
): ScoredPara[] {
  const terms = tokenize(query);
  if (terms.length === 0 || notes.length === 0) return [];
  const scored: ScoredPara[] = [];
  for (const note of notes) {
    const paras = note.rawText
      .replace(/\r/g, "")
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const list = paras.length >= 2 ? paras : note.rawText.split(/\n/).map((s) => s.trim()).filter((s) => s.length > 0);
    list.forEach((text, pi) => {
      const low = text.toLowerCase();
      let score = 0;
      for (const t of terms) {
        score += countOccur(low, t) * t.length;
        if (note.title.toLowerCase().includes(t)) score += 5;
      }
      if (score > 0) scored.push({ noteId: note.id, noteTitle: note.title, paraId: `p${pi}`, text, score });
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const out: ScoredPara[] = [];
  let used = 0;
  for (const s of scored) {
    if (out.length >= topK || used + s.text.length > maxChars) break;
    out.push(s);
    used += s.text.length;
  }
  return out;
}
