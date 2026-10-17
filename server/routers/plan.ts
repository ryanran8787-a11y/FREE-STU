import { z } from "zod";
import { db } from "@/lib/db";
import { chatCompletion, getKeyOrThrow, logUsage } from "@/server/llm";
import { globalStyle, withStyle } from "@/server/style";
import { publicProcedure, router } from "@/server/trpc";

const difficulty = z.enum(["easy", "medium", "hard"]);
const LANG_WORDS: Record<string, string> = { "zh-Hant": "繁體中文", "zh-Hans": "简体中文", en: "English" };

export const planRouter = router({
  start: publicProcedure
    .input(z.object({ noteId: z.string(), days: z.number().int().min(1).max(30).default(7), difficulty: difficulty.default("medium"), language: z.enum(["zh-Hant", "zh-Hans", "en"]).default("zh-Hant") }))
    .mutation(async ({ input }) => {
      const note = await db.note.findUnique({ where: { id: input.noteId } });
      if (!note) throw new Error("找不到筆記");
      const plan = await db.studyPlan.create({ data: { noteId: input.noteId, days: input.days, difficulty: input.difficulty, status: "pending" } });
      // inline run (no queue)
      void runPlan(plan.id, note.rawText, note.title, input.days, input.difficulty, input.language);
      return { id: plan.id };
    }),

  status: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const p = await db.studyPlan.findUnique({ where: { id: input.id } });
    if (!p) throw new Error("找不到計畫");
    return { status: p.status, result: p.result, error: p.error };
  }),

  list: publicProcedure.input(z.object({ noteId: z.string() })).query(async ({ input }) => {
    return db.studyPlan.findMany({ where: { noteId: input.noteId }, orderBy: { createdAt: "desc" } });
  }),

  remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    await db.studyPlan.delete({ where: { id: input.id } }).catch(() => undefined);
    return { ok: true };
  }),
});

async function runPlan(id: string, rawText: string, title: string, days: number, difficulty: string, language: string) {
  try {
    const key = await getKeyOrThrow();
    const langName = LANG_WORDS[language] ?? "繁體中文";
    const diffWord = difficulty === "easy" ? "簡單" : difficulty === "hard" ? "困難" : "中等";
    const { text, usage } = await chatCompletion({
      baseUrl: key.baseUrl,
      apiKey: key.apiKey,
      model: key.model,
      messages: [
        {
          role: "user",
          content: withStyle(
            `你是學習規劃師。根據以下筆記，用${langName}生成一份 ${days} 天的學習計畫（難度${diffWord}），每天 30-60 分鐘。只回傳 JSON 陣列，每個元素 {day(1..${days}), title(當天主題，10字內), tasks(字串陣列，2-4 項，每項一句話，可含段落編號如 [p3])}，不要其他文字。\\n\\n筆記標題：${title}\\n\\n${rawText.slice(0, 12000)}`,
            await globalStyle(),
            true,
          ),
        },
      ],
      temperature: 0.5,
    });
    await logUsage("plan", key.model, usage);
    // validate
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.trim().replace(/^```json\\s*/i, "").replace(/```\\s*$/i, "").trim());
    } catch {
      // try extract array
      const m = text.match(/\[[\s\S]*\]/);
      if (m) parsed = JSON.parse(m[0]);
      else throw new Error("模型回傳格式不符");
    }
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("計畫為空");
    await db.studyPlan.update({ where: { id }, data: { status: "done", result: JSON.stringify(parsed) } });
  } catch (e) {
    await db.studyPlan.update({ where: { id }, data: { status: "error", error: e instanceof Error ? e.message.slice(0, 500) : "未知錯誤" } });
  }
}
