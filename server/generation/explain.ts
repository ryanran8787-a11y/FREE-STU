// 測驗錯題解釋：三角度（白話/反例/類比），結果快取進 options.explainCache[qIndex]。
// 對外介面：explainQuiz(genId, qIndex) -> { text }；找不到/非法直接 throw 人話錯誤。
import { db } from "@/lib/db";
import { chatCompletion, getKeyOrThrow, logUsage } from "@/server/llm";
import { normalizeOptions, safeParseOptions } from "./options";

export async function explainQuiz(genId: string, qIndex: number): Promise<{ text: string }> {
  const gen = await db.generation.findUnique({ where: { id: genId } });
  if (!gen || gen.type !== "quiz" || gen.status !== "done" || !gen.result) throw new Error("找不到這份測驗");
  const options = normalizeOptions(safeParseOptions(gen.options));
  const cache = options.explainCache && typeof options.explainCache === "object" ? options.explainCache : {};
  const key = String(qIndex);
  if (cache[key]) return { text: cache[key] };
  const items = JSON.parse(gen.result) as { question: string; options: string[]; answer: number }[];
  const q = items[qIndex];
  if (!q) throw new Error("題目不存在");
  const keyRow = await getKeyOrThrow();
  const lang = options.language === "zh-Hans" || options.language === "en" ? options.language : "zh-Hant";
  const langName = lang === "zh-Hans" ? "简体中文" : lang === "en" ? "English" : "繁體中文";
  const { text, usage } = await chatCompletion({
    baseUrl: keyRow.baseUrl,
    apiKey: keyRow.apiKey,
    model: keyRow.model,
    messages: [
      {
        role: "user",
        content: `你是學習助教。使用者答錯了這題，請用${langName}從三個角度再講一次：\n1. 白話解釋（不用術語）\n2. 反例/對比（容易混淆的點）\n3. 類比（生活例子）\n每段不超過 100 字，只回傳 Markdown，不要程式碼圍欄。\n\n題目：${q.question}\n選項：${q.options.map((o, i) => `${i}. ${o}`).join(" / ")}\n正確答案：${q.options[q.answer]}\n${options.focus ? `主題聚焦：${options.focus}` : ""}`,
      },
    ],
    temperature: 0.5,
  });
  await logUsage("explain", keyRow.model, usage);
  cache[key] = text.trim().slice(0, 1500);
  await db.generation.update({
    where: { id: genId },
    data: { options: JSON.stringify({ ...options, explainCache: cache }) },
  });
  return { text: cache[key] };
}
