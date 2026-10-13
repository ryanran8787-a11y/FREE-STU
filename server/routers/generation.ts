import { z } from "zod";
import { db } from "@/lib/db";
import { extractSourceMap, headParagraphs } from "@/lib/paras";
import { flashcardCount, quizCount, type CountLevel } from "@/lib/counts";
import { chatCompletion, getKeyOrThrow, logUsage, parseJsonArray } from "@/server/llm";
import { publicProcedure, router } from "@/server/trpc";

const generationType = z.enum(["flashcards", "quiz", "mindmap"]);
const countLevel = z.enum(["less", "standard", "more"]);
const difficulty = z.enum(["easy", "medium", "hard"]);
const language = z.enum(["zh-Hant", "zh-Hans", "en"]);

const DIFF_WORDS: Record<string, string> = {
  easy: "ç°¡å–®ï¼ˆåŸºç¤è??¶ã€å?ç¾©ï?",
  medium: "ä¸­ç?ï¼ˆç?è§???¨ï?",
  hard: "?°é›£ï¼ˆç??ˆå??ã€é™·?±é?ï¼?,
};

const LANG_WORDS: Record<string, string> = {
  "zh-Hant": "ç¹é?ä¸­æ?",
  "zh-Hans": "ç®€ä½“ä¸­??,
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
  const focus = o.focus.trim() ? `\nä¸»é??šç„¦ï¼?{o.focus.trim().slice(0, 500)}ï¼ˆå„ª?ˆå?ç¹é€™å€‹ä¸»é¡Œå‡ºé¡Œï?` : "";
  if (type === "mindmap") {
    const depth = o.count === "less" ? "ç²¾ç°¡ï¼ˆæ?å¤?å±¤ã€æ?å±¤ä?è¶…é?4?‹å??¯ï?" : o.count === "more" ? "è©³ç›¡ï¼?-4å±¤ã€å??†æ”¯?å…¨è¦†è?ï¼? : "æ¨™æ?ï¼?å±¤ã€æ?å±?-6?‹å??¯ï?";
    return `ä½ æ˜¯å­¸ç??©æ??‚æ ¹?šä»¥ä¸‹ç·¨?Ÿæ®µ?½ç”¢?Ÿä?ä»?{lang}å¿ƒæ™º?–å¤§ç¶±ï?${depth}ï¼Œé›£åº?{DIFF_WORDS[o.difficulty]}?‚åª?å‚³ Markdownï¼? ä¸»é???# ?†æ”¯??## ?‰ç?é»ï?ï¼Œä?è¦ç?å¼ç¢¼?æ??ä?è¦å…¶ä»–æ?å­—ã€‚é?è¦ï?æ¯å€?## / ### æ¨™é??«å°¾å¿…é?æ¨™è¨»å®ƒä??šç?æ®µè½ç·¨è?ï¼Œå½¢å¦‚ã€?# ??­·å®?? [p3,p7]?ï?ç·¨è??ªèƒ½?¨ä??¢çµ¦?ºç?ï¼Œæœªä¾æ?ä»»ä?æ®µè½å°±ä?è¦æ?ï¼?{focus}\n\n`;
  }
  const count = n ?? 5;
  if (type === "flashcards") {
    return `ä½ æ˜¯å­¸ç??©æ??‚æ ¹?šä»¥ä¸‹ç?è¨˜ç”¢??${count} å¼?{lang}?ƒå¡ï¼Œé›£åº?{DIFF_WORDS[o.difficulty]}ï¼Œåª?å‚³ JSON ???ï¼Œæ??‹å?ç´?{front, back}ï¼Œä?è¦å…¶ä»–æ?å­—ï?${focus}\n\n`;
  }
  return `ä½ æ˜¯å­¸ç??©æ??‚æ ¹?šä»¥ä¸‹ç?è¨˜ç”¢??${count} é¡?{lang}?®é¸æ¸¬é?ï¼Œé›£åº?{DIFF_WORDS[o.difficulty]}ï¼Œåª?å‚³ JSON ???ï¼Œæ??‹å?ç´?{question, options(4?‹å?ä¸²ï?ä¸è?? A/B/C/Dç·¨è?), answer(æ­?¢º?¸é??„ç´¢å¼?-3), explanation(?ºä?éº¼æ­£ç¢ºã€ä??©å¥è©?{lang})}ï¼Œä?è¦å…¶ä»–æ?å­—ï?${focus}\n\n`;
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
    // ?¸é?ï¼šè‡ªè¨‚å„ª?ˆï??¦å??‰ç?è¨˜å??¸ç¾ç®—ï?å¿ƒæ™º?–ä?è¨ˆæ•¸ï¼Œç”¨å±¤ç??è¿°ï¼‰ï?ä¸¦å¯«??options ä¾›æ­·?²é¡¯ç¤?    const chars = gen.note.rawText.length;
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
    // å¿ƒæ™º?–é¤µç·¨è?æ®µè½ï¼Œå…¶ä»–æ²¿?¨å??‡æˆª??    const paras = gen.type === "mindmap" ? headParagraphs(gen.note.rawText) : [];
    const context =
      gen.type === "mindmap"
        ? paras.map((p) => `[${p.id}] ${p.text}`).join("\n")
        : gen.note.rawText.slice(0, 12000);
    const { text, usage } = await chatCompletion({
      baseUrl: key.baseUrl,
      apiKey: key.apiKey,
      model: key.model,
      messages: [{ role: "user", content: buildPrompt(gen.type as "flashcards" | "quiz" | "mindmap", o, n) + context }],
      temperature: 0.5,
    });
    await logUsage(gen.type, key.model, usage);
    // å¿ƒæ™º?–ï??½å??¨ã€é? ID?å?ä¹¾æ·¨ md + ? å?ï¼›å…¶ä»–èµ° JSON è§??
    if (gen.type === "mindmap") {
      const { cleaned, sourceMap } = extractSourceMap(
        text.trim(),
        new Set(paras.map((p) => p.id)),
      );
      await db.generation.update({
        where: { id },
        data: {
          status: "done",
          result: cleaned,
          options: JSON.stringify({ ...o, customCount: custom, resolvedCount: n, chars, sourceMap }),
        },
      });
      return;
    }
    const items = parseJsonArray(text);
    await db.generation.update({
      where: { id },
      data: { status: "done", result: JSON.stringify(items) },
    });
  } catch (e) {
    await db.generation.update({
      where: { id },
      data: { status: "error", error: e instanceof Error ? e.message.slice(0, 500) : "?ªçŸ¥?¯èª¤" },
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
      if (!note) throw new Error("?¾ä??°ç?è¨?);
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
    // çª®äºº queueï¼šç¬¬ä¸€??poll ??pending ?„è?æ±‚è?è²¬åŸ·è¡Œï?CAS ?¶é?ï¼‰ï??¶ä?äººç?çµæ???    const claimed = await db.generation.updateMany({
      where: { id: input.id, status: "pending" },
      data: { status: "running" },
    });
    if (claimed.count === 1) {
      await runGeneration(input.id);
    }
    const gen = await db.generation.findUnique({ where: { id: input.id } });
    if (!gen) throw new Error("?¾ä??°ä»»??);
    return { status: gen.status, result: gen.result, error: gen.error, options: gen.options };
  }),
});
