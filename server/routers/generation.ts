import { z } from "zod";
import { db } from "@/lib/db";
import { flashcardCount, quizCount, type CountLevel } from "@/lib/counts";
import { chatCompletion, getKeyOrThrow, logUsage, parseJsonArray } from "@/server/llm";
import { publicProcedure, router } from "@/server/trpc";

const generationType = z.enum(["flashcards", "quiz", "mindmap"]);
const countLevel = z.enum(["less", "standard", "more"]);
const difficulty = z.enum(["easy", "medium", "hard"]);
const language = z.enum(["zh-Hant", "zh-Hans", "en"]);

const DIFF_WORDS: Record<string, string> = {
  easy: "簡單（基礎記憶、定義）",
  medium: "中等（理解應用）",
  hard: "困難（綜合分析、陷阱題）",
};

const LANG_WORDS: Record<string, string> = {
  "zh-Hant": "繁體中文",
  "zh-Hans": "简体中文",
  en: "English",
};

export type GenOptions = {
  count: z.infer<typeof countLevel>;
  difficulty: z.infer<typeof difficulty>;
  language: z.infer<typeof language>;
  focus: string;
  customCount?: number;
};

function buildPrompt(type: z.infer<typeof generationType>, o: GenOptions, n: number | null): string {
  const lang = LANG_WORDS[o.language];
  const focus = o.focus.trim() ? `\n主題聚焦：${o.focus.trim().slice(0, 500)}（優先圍繞這個主題出題）` : "";
  if (type === "mindmap") {
    const depth = o.count === "less" ? "精簡（最多2層、每層不超過4個分支）" : o.count === "more" ? "詳盡（3-4層、多分支、全覆蓋）" : "標準（3層、每層3-6個分支）";
    return `你是學習助教。根據以下筆記產生一份${lang}心智圖大綱，${depth}，難度${DIFF_WORDS[o.difficulty]}，只回傳 Markdown（# 主題、## 分支、### 葉節點），不要程式碼圍欄、不要其他文字：${focus}\n\n`;
  }
  const count = n ?? 5;
  if (type === "flashcards") {
    return `你是學習助教。根據以下筆記產生 ${count} 張${lang}閃卡，難度${DIFF_WORDS[o.difficulty]}，只回傳 JSON 陣列，每個元素 {front, back}，不要其他文字：${focus}\n\n`;
  }
  return `你是學習助教。根據以下筆記產生 ${count} 題${lang}單選測驗，難度${DIFF_WORDS[o.difficulty]}，只回傳 JSON 陣列，每個元素 {question, options(4個字串，不要加A/B/C/D編號), answer(正確選項的索引0-3), explanation(為什麼正確、一兩句話${lang})}，不要其他文字：${focus}\n\n`;
}

async function runGeneration(id: string) {
  const gen = await db.generation.findUnique({
    where: { id },
    include: { note: true },
  });
  if (!gen || gen.status !== "running") return;
  try {
    const options = JSON.parse(gen.options || "{}") as Partial<GenOptions>;
    const o: GenOptions = {
      count: options.count === "less" || options.count === "more" ? options.count : "standard",
      difficulty:
        options.difficulty === "easy" || options.difficulty === "hard" ? options.difficulty : "medium",
      language: options.language === "zh-Hans" || options.language === "en" ? options.language : "zh-Hant",
      focus: typeof options.focus === "string" ? options.focus : "",
    };
    // 數量：自訂優先，否則按筆記字數現算（心智圖不計數，用層級描述），並寫回 options 供歷史顯示
    const chars = gen.note.rawText.length;
    const custom = typeof options.customCount === "number" ? Math.min(50, Math.max(1, Math.floor(options.customCount))) : undefined;
    const n =
      gen.type === "mindmap"
        ? null
        : (custom ??
          (gen.type === "flashcards"
            ? flashcardCount(chars, o.count as CountLevel)
            : quizCount(chars, o.count as CountLevel)));
    await db.generation.update({
      where: { id: gen.id },
      data: { options: JSON.stringify({ ...o, customCount: custom, resolvedCount: n, chars }) },
    });
    const key = await getKeyOrThrow();
    const { text, usage } = await chatCompletion({
      baseUrl: key.baseUrl,
      apiKey: key.apiKey,
      model: key.model,
      messages: [{ role: "user", content: buildPrompt(gen.type as "flashcards" | "quiz" | "mindmap", o, n) + gen.note.rawText.slice(0, 12000) }],
      temperature: 0.5,
    });
    await logUsage(gen.type, key.model, usage);
    // 心智圖存 Markdown 原文，其他走 JSON 解析
    const stored = gen.type === "mindmap" ? text.trim() : JSON.stringify(parseJsonArray(text));
    await db.generation.update({
      where: { id },
      data: { status: "done", result: stored },
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
    .input(
      z.object({
        noteId: z.string(),
        type: generationType,
        count: countLevel.default("standard"),
        difficulty: difficulty.default("medium"),
        language: language.default("zh-Hant"),
        focus: z.string().max(500).default(""),
        customCount: z.number().int().min(1).max(50).optional(),
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
          options: JSON.stringify({ count: input.count, difficulty: input.difficulty, language: input.language, focus: input.focus }),
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
    return { status: gen.status, result: gen.result, error: gen.error };
  }),
});
