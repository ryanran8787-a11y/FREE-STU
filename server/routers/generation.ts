import { z } from "zod";
import { db } from "@/lib/db";
import { chatCompletion, getKeyOrThrow, parseJsonArray } from "@/server/llm";
import { publicProcedure, router } from "@/server/trpc";

const generationType = z.enum(["flashcards", "quiz"]);

const PROMPTS: Record<z.infer<typeof generationType>, string> = {
  flashcards:
    "你是學習助教。根據以下筆記產生 8 張繁體中文閃卡，只回傳 JSON 陣列，每個元素 {front, back}，不要其他文字：\n\n",
  quiz: "你是學習助教。根據以下筆記產生 5 題繁體中文單選測驗，只回傳 JSON 陣列，每個元素 {question, options(4個字串，不要加A/B/C/D編號), answer(正確選項的索引0-3)}，不要其他文字：\n\n",
};

async function runGeneration(id: string) {
  const gen = await db.generation.findUnique({
    where: { id },
    include: { note: true },
  });
  if (!gen || gen.status !== "running") return;
  try {
    const key = await getKeyOrThrow();
    const reply = await chatCompletion({
      baseUrl: key.baseUrl,
      apiKey: key.apiKey,
      model: key.model,
      messages: [{ role: "user", content: PROMPTS[gen.type as keyof typeof PROMPTS] + gen.note.rawText.slice(0, 12000) }],
      temperature: 0.5,
    });
    const items = parseJsonArray(reply);
    await db.generation.update({
      where: { id },
      data: { status: "done", result: JSON.stringify(items) },
    });
  } catch (e) {
    await db.generation.update({
      where: { id },
      data: { status: "error", error: e instanceof Error ? e.message.slice(0, 500) : "未知錯誤" },
    });
  }
}

export const generationRouter = router({
  start: publicProcedure
    .input(z.object({ noteId: z.string(), type: generationType }))
    .mutation(async ({ input }) => {
      const note = await db.note.findUnique({ where: { id: input.noteId } });
      if (!note) throw new Error("找不到筆記");
      const gen = await db.generation.create({
        data: { noteId: input.noteId, type: input.type, status: "pending" },
      });
      return { id: gen.id };
    }),

  getStatus: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    // 窮人 queue：第一個 poll 到 pending 的請求負責執行（CAS 搶鎖），其他人等結果。
    const claimed = await db.generation.updateMany({
      where: { id: input.id, status: "pending" },
      data: { status: "running" },
    });
    if (claimed.count === 1) {
      await runGeneration(input.id);
    }
    const gen = await db.generation.findUnique({ where: { id: input.id } });
    if (!gen) throw new Error("找不到任務");
    return { status: gen.status, result: gen.result, error: gen.error };
  }),
});
