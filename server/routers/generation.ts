import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { extractSourceMap, headParagraphs } from "@/lib/paras";
import { flashcardCount, quizCount, type CountLevel } from "@/lib/counts";
import { chatCompletion, getKeyOrThrow, logUsage, parseJsonArray } from "@/server/llm";
import {
  DIALOGUE_CHAR_CAP,
  READ_CHAR_CAP,
  splitChunks,
  synthesizeLines,
  type PodLine,
  type VoicePairId,
} from "@/server/podcast";
import { publicProcedure, router } from "@/server/trpc";

const generationType = z.enum(["flashcards", "quiz", "mindmap", "podcast"]);
const countLevel = z.enum(["less", "standard", "more"]);
const difficulty = z.enum(["easy", "medium", "hard"]);
const language = z.enum(["zh-Hant", "zh-Hans", "en"]);
const podcastMode = z.enum(["read", "dialogue"]);
const voicePair = z.enum(["cn", "tw"]);

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
  podcastMode?: z.infer<typeof podcastMode>;
  voicePair?: z.infer<typeof voicePair>;
};

function buildPrompt(type: z.infer<typeof generationType>, o: GenOptions, n: number | null): string {
  const lang = LANG_WORDS[o.language];
  const focus = o.focus.trim() ? `\n主題聚焦：${o.focus.trim().slice(0, 500)}（優先圍繞這個主題出題）` : "";
  if (type === "mindmap") {
    const depth = o.count === "less" ? "精簡（最多2層、每層不超過4個分支）" : o.count === "more" ? "詳盡（3-4層、多分支、全覆蓋）" : "標準（3層、每層3-6個分支）";
    return `你是學習助教。根據以下編號段落產生一份${lang}心智圖大綱，${depth}，難度${DIFF_WORDS[o.difficulty]}。只回傳 Markdown（# 主題、## 分支、### 葉節點），不要程式碼圍欄、不要其他文字。重要：每個 ## / ### 標題末尾必須標註它依據的段落編號，形如「## 監護宣告 [p3,p7]」或區間「## 行為能力 [p6-p7]」，編號只能用下面給出的，未依據任何段落就不要標：${focus}\n\n`;
  }
  const count = n ?? 5;
  if (type === "flashcards") {
    return `你是學習助教。根據以下筆記產生 ${count} 張${lang}閃卡，難度${DIFF_WORDS[o.difficulty]}，只回傳 JSON 陣列，每個元素 {front, back}，不要其他文字：${focus}\n\n`;
  }
  return `你是學習助教。根據以下筆記產生 ${count} 題${lang}單選測驗，難度${DIFF_WORDS[o.difficulty]}，只回傳 JSON 陣列，每個元素 {question, options(4個字串，不要加A/B/C/D編號), answer(正確選項的索引0-3), explanation(為什麼正確、一兩句話${lang})}，不要其他文字：${focus}\n\n`;
}

function buildDialoguePrompt(lang: string, focus: string): string {
  const f = focus.trim() ? `\n主題聚焦：${focus.trim().slice(0, 500)}（優先圍繞這個主題聊）` : "";
  return `你是播客編劇。根據以下筆記寫一段${lang}雙人對談逐字稿：A 是主持人（提問、串場、幫聽眾總結），B 是講解者（用人話講清楚概念，可以舉例）。10 到 16 輪，兩人輪流發言，每句 150 字以內，總長 2000 字以內，口語、不要書面腔，不要開場白以外的廢話。只回傳 JSON 陣列，每個元素 {speaker（只能是 "A" 或 "B"）, text}，不要其他文字：${f}\n\n`;
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

async function runPodcast(id: string, rawText: string, options: Partial<GenOptions>) {
  try {
    const mode = options.podcastMode === "dialogue" ? "dialogue" : "read";
    const pair: VoicePairId = options.voicePair === "tw" ? "tw" : "cn";
    const lang = options.language === "zh-Hans" || options.language === "en" ? options.language : "zh-Hant";
    const focus = typeof options.focus === "string" ? options.focus : "";
    let lines: PodLine[];
    if (mode === "dialogue") {
      const key = await getKeyOrThrow();
      const langName = lang === "zh-Hans" ? "简体中文" : lang === "en" ? "English" : "繁體中文";
      const { text, usage } = await chatCompletion({
        baseUrl: key.baseUrl,
        apiKey: key.apiKey,
        model: key.model,
        messages: [{ role: "user", content: buildDialoguePrompt(langName, focus) + rawText.slice(0, 12000) }],
        temperature: 0.7,
      });
      await logUsage("podcast", key.model, usage);
      lines = parseDialogue(text);
      if (lines.length === 0) throw new Error("對話稿產生失敗（模型沒照格式回，再試一次）");
    } else {
      const body = rawText.slice(0, READ_CHAR_CAP).trim();
      if (!body) throw new Error("筆記是空的，沒東西可唸");
      lines = splitChunks(body).map((t) => ({ speaker: "A" as const, text: t }));
    }
    const audio = await synthesizeLines(lines, pair);
    const dir = path.join(process.cwd(), "data", "podcasts");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${id}.mp3`), audio);
    const chars = lines.reduce((a, l) => a + l.text.length, 0);
    await db.generation.update({
      where: { id },
      data: {
        status: "done",
        result: JSON.stringify({ mode, voicePair: pair, lines, chars }),
        options: JSON.stringify({ ...options, podcastMode: mode, voicePair: pair, lineCount: lines.length, chars }),
      },
    });
  } catch (e) {
    await db.generation.update({
      where: { id },
      data: { status: "error", error: e instanceof Error ? e.message.slice(0, 500) : "未知錯誤" },
    });
  }
}

async function runGeneration(id: string) {
  const gen = await db.generation.findUnique({
    where: { id },
    include: { note: true },
  });
  if (!gen || gen.status !== "running") return;
  // 播客走獨立分支（寫稿→TTS→存檔）
  if (gen.type === "podcast") {
    let options: Partial<GenOptions> = {};
    try {
      options = JSON.parse(gen.options || "{}") as Partial<GenOptions>;
    } catch {
      /* ignore */
    }
    await runPodcast(id, gen.note.rawText, options);
    return;
  }
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
    // 心智圖餵編號段落，其他沿用原文截斷
    const paras = gen.type === "mindmap" ? headParagraphs(gen.note.rawText) : [];
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
    // 心智圖：抽引用、驗 ID、存乾淨 md + 映射；其他走 JSON 解析
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
        podcastMode: podcastMode.default("read"),
        voicePair: voicePair.default("cn"),
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
          options: JSON.stringify({ count: input.count, difficulty: input.difficulty, language: input.language, focus: input.focus, podcastMode: input.podcastMode, voicePair: input.voicePair }),
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
