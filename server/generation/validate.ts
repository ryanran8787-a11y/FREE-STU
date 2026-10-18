import { parseJsonArray } from "@/server/llm";
import { DIALOGUE_CHAR_CAP, type PodLine } from "@/server/podcast";

/** 從 LLM 輸出尾端抽「⚠️ 衝突：...」清單（知識衝突偵測） */
export function parseConflicts(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/⚠️\s*衝突[:：]\s*(.+)/);
    if (m) out.push(m[1].trim());
  }
  return out;
}

/** 閃卡/測驗回傳驗證：爛掉的單題丟掉不存（F-1：以前 answer 越界會存進「永遠答不對的題」） */
export function sanitizeItems(
  type: "flashcards" | "quiz",
  items: unknown[],
): { front: string; back: string }[] | { question: string; options: string[]; answer: number; explanation?: string }[] {
  if (type === "flashcards") {
    const out: { front: string; back: string }[] = [];
    for (const it of items) {
      const r = it as { front?: unknown; back?: unknown };
      if (typeof r.front !== "string" || !r.front.trim()) continue;
      out.push({ front: r.front.trim(), back: typeof r.back === "string" ? r.back : "" });
    }
    return out;
  }
  const out: { question: string; options: string[]; answer: number; explanation?: string }[] = [];
  for (const it of items) {
    const r = it as { question?: unknown; options?: unknown; answer?: unknown; explanation?: unknown };
    if (typeof r.question !== "string" || !r.question.trim()) continue;
    const opts = (Array.isArray(r.options) ? r.options : [])
      .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
      .map((o) => o.trim())
      .slice(0, 4);
    if (opts.length < 2) continue;
    const answer = typeof r.answer === "number" ? Math.min(opts.length - 1, Math.max(0, Math.floor(r.answer))) : 0;
    out.push({
      question: r.question.trim(),
      options: opts,
      answer,
      ...(typeof r.explanation === "string" && r.explanation.trim() ? { explanation: r.explanation.trim() } : {}),
    });
  }
  return out;
}

/** 對話稿驗證：只留下合法的輪次，總長封頂 */
export function parseDialogue(text: string): PodLine[] {
  let raw: { speaker?: unknown; text?: unknown }[];
  try {
    raw = parseJsonArray(text) as { speaker?: unknown; text?: unknown }[];
  } catch {
    return []; // 模型沒照格式回，上層轉成人話錯誤
  }
  const lines: PodLine[] = [];
  let total = 0;
  for (const r of raw) {
    if (lines.length >= 40) break;
    const speaker = r.speaker === "B" ? "B" : r.speaker === "A" ? "A" : null;
    const t = typeof r.text === "string" ? r.text.trim() : "";
    if (!speaker || !t) continue;
    const cut = t.slice(0, 600);
    if (total + cut.length > DIALOGUE_CHAR_CAP) break;
    total += cut.length;
    lines.push({ speaker, text: cut });
  }
  return lines;
}
