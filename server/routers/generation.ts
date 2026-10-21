// generation router：薄轉接層 —— zod 輸入校驗 + 轉交深模組。
// 執行邏輯在 server/generation/runners.ts（唯一出口 runGeneration），
// 錯題解釋在 server/generation/explain.ts（explainQuiz）。
// 這個檔案只做：建 pending row、CAS 搶鎖、CRUD 存檔，不碰 LLM/TTS。
import { z } from "zod";
import { db } from "@/lib/db";
import { publicProcedure, router } from "@/server/trpc";
import {
  countLevel,
  customKind,
  customLength,
  customMethod,
  difficulty,
  generationType,
  language,
  podcastMode,
  voicePair,
} from "@/server/generation/options";
import { runGeneration } from "@/server/generation/runners";
import { explainQuiz } from "@/server/generation/explain";
import { parseQuizItems, stripQuizForInteract } from "@/lib/quiz";

export const generationRouter = router({
  start: publicProcedure
    .input(
      z.object({
        noteId: z.string(),
        type: generationType,
        count: countLevel.default("standard"),
        difficulty: difficulty.default("medium"),
        language: language.default("zh-Hant"),
        focus: z.string().max(500).default(""),
        customCount: z.number().int().min(1).max(50).optional(),
        podcastMode: podcastMode.default("read"),
        voicePair: voicePair.default("cn"),
        customKind: customKind.default("simple"),
        customMethod: customMethod.default("explain"),
        customLength: customLength.default("standard"),
        customHintFirst: z.boolean().default(false),
        customTemplateId: z.string().max(100).default(""),
        customBody: z.string().max(8000).default(""),
      }),
    )
    .mutation(async ({ input }) => {
      const note = await db.note.findUnique({ where: { id: input.noteId } });
      if (!note) throw new Error("找不到筆記");
      const gen = await db.generation.create({
        data: {
          noteId: input.noteId,
          type: input.type,
          status: "pending",
          options: JSON.stringify({ count: input.count, difficulty: input.difficulty, language: input.language, focus: input.focus, customCount: input.customCount, podcastMode: input.podcastMode, voicePair: input.voicePair, customKind: input.customKind, customMethod: input.customMethod, customLength: input.customLength, customHintFirst: input.customHintFirst, customTemplateId: input.customTemplateId, customBody: input.customBody }),
        },
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
    return { status: gen.status, result: gen.result, error: gen.error, options: gen.options };
  }),

  /** 心智圖編輯存檔：覆寫 result + 來源映射（只允許改 mindmap 且已完成的） */
  saveResult: publicProcedure
    .input(
      z.object({
        id: z.string(),
        result: z.string().min(1).max(60000),
        sourceMap: z.record(z.string(), z.array(z.string())).default({}),
      }),
    )
    .mutation(async ({ input }) => {
      const gen = await db.generation.findUnique({ where: { id: input.id } });
      if (!gen || gen.type !== "mindmap" || gen.status !== "done") throw new Error("只能編輯已完成的心智圖");
      let options: Record<string, unknown> = {};
      try {
        options = JSON.parse(gen.options || "{}") as Record<string, unknown>;
      } catch {
        /* ignore */
      }
      await db.generation.update({
        where: { id: input.id },
        data: { result: input.result, options: JSON.stringify({ ...options, sourceMap: input.sourceMap }) },
      });
      return { ok: true };
    }),

  /** 答錯時按「要解釋」觸發：三角度（白話/反例/類比），結果存 options.explainCache[qIndex] */
  explain: publicProcedure
    .input(z.object({ id: z.string(), qIndex: z.number().int().min(0).max(500) }))
    .mutation(async ({ input }) => {
      return explainQuiz(input.id, input.qIndex);
    }),

  /**
   * T1-2 Top-1 互動通道：回去答案版（永不夾帶 answer/explanation）。
   * 判分走 attempt.log（server 判、判後釋放該題答案）；列印/匯出走 quizPrintable。
   */
  quizInteract: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const gen = await db.generation.findUnique({ where: { id: input.id } });
    if (!gen || gen.type !== "quiz") throw new Error("找不到這份測驗");
    return { status: gen.status, items: stripQuizForInteract(parseQuizItems(gen.result)), error: gen.error };
  }),

  /** T1-2 列印/匯出專用通道：完整版（含答案），互動頁不用這個端點。 */
  quizPrintable: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const gen = await db.generation.findUnique({ where: { id: input.id } });
    if (!gen || gen.type !== "quiz") throw new Error("找不到這份測驗");
    return { status: gen.status, items: parseQuizItems(gen.result), error: gen.error };
  }),

  /** 節點已理解標記：存在 options.mastered */
  setMastered: publicProcedure
    .input(z.object({ id: z.string(), titles: z.array(z.string().max(200)).max(500) }))
    .mutation(async ({ input }) => {
      const gen = await db.generation.findUnique({ where: { id: input.id } });
      if (!gen || gen.type !== "mindmap") throw new Error("只能標記心智圖節點");
      let options: Record<string, unknown> = {};
      try {
        options = JSON.parse(gen.options || "{}") as Record<string, unknown>;
      } catch {
        /* ignore */
      }
      await db.generation.update({
        where: { id: input.id },
        data: { options: JSON.stringify({ ...options, mastered: [...new Set(input.titles)] }) },
      });
      return { ok: true };
    }),
});
