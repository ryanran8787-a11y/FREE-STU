import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { extractSourceMap, headParagraphs } from "@/lib/paras";
import { flashcardCount, quizCount, type CountLevel } from "@/lib/counts";
import { chatCompletion, getKeyOrThrow, logUsage, parseJsonArray } from "@/server/llm";
import { globalStyle, withStyle } from "@/server/style";
import { splitParagraphs } from "@/lib/paras";
import { searchNotes } from "@/lib/retrieval";
import {
  BUILTIN_TEMPLATES,
  buildSimplePrompt,
  renderCustomPrompt,
  type SimpleLength,
  type SimpleMethod,
} from "@/server/custom";
import {
  DIALOGUE_CHAR_CAP,
  READ_CHAR_CAP,
  splitChunks,
  synthesizeLines,
  type PodLine,
  type VoicePairId,
} from "@/server/podcast";
import { publicProcedure, router } from "@/server/trpc";

const generationType = z.enum(["flashcards", "quiz", "mindmap", "podcast", "custom"]);
const countLevel = z.enum(["less", "standard", "more"]);
const difficulty = z.enum(["easy", "medium", "hard"]);
const language = z.enum(["zh-Hant", "zh-Hans", "en"]);
const podcastMode = z.enum(["read", "dialogue"]);
const voicePair = z.enum(["cn", "tw"]);
const customKind = z.enum(["simple", "template", "raw"]);
const customMethod = z.enum(["explain", "points", "table", "story"]);
const customLength = z.enum(["short", "standard", "long"]);

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
  customKind?: z.infer<typeof customKind>;
  customMethod?: z.infer<typeof customMethod>;
  customLength?: z.infer<typeof customLength>;
  customHintFirst?: boolean;
  customTemplateId?: string;
  customBody?: string;
  explainCache?: Record<string, string>;
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
    return `你是學習助教。根據以下筆記產生 ${count} 張${lang}閃卡，難度${DIFF_WORDS[o.difficulty]}，只回傳 JSON 陣列，每個元素 {front, back}，不要其他文字：${focus}

若筆記內有互相矛盾的敘述，請在 JSON 陣列之後另起一行寫「⚠️ 衝突：A 說…，B 說…」，一行一個，沒有就不要寫。\n\n`;
  }
  if (type === "quiz") {
    return `你是學習助教。根據以下筆記產生 ${count} 題${lang}單選測驗，難度${DIFF_WORDS[o.difficulty]}，只回傳 JSON 陣列，每個元素 {question, options(4個字串，不要加A/B/C/D編號), answer(正確選項的索引0-3), explanation(為什麼正確、一兩句話${lang})}，不要其他文字：${focus}

若筆記內有互相矛盾的敘述，請在 JSON 陣列之後另起一行寫「⚠️ 衝突：A 說…，B 說…」，一行一個，沒有就不要寫。\n\n`;
  }
  return "";
}

/** 從 LLM 輸出尾端抽「⚠️ 衝突：...」清單（知識衝突偵測） */
export function parseConflicts(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/⚠️\s*衝突[:：]\s*(.+)/);
    if (m) out.push(m[1].trim());
  }
  return out;
}

function buildDialoguePrompt(lang: string, focus: string): string {
  const f = focus.trim() ? `\n主題聚焦：${focus.trim().slice(0, 500)}（優先圍繞這個主題聊）` : "";
  return `你是播客編劇。根據以下筆記寫一段${lang}雙人對談逐字稿：A 是主持人（提問、串場、幫聽眾總結），B 是講解者（用人話講清楚概念，可以舉例）。10 到 16 輪，兩人輪流發言，每句 150 字以內，總長 2000 字以內，口語、不要書面腔，不要開場白以外的廢話。只回傳 JSON 陣列，每個元素 {speaker（只能是 "A" 或 "B"）, text}，不要其他文字：${f}\n\n`;
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

async function runCustom(id: string, note: { title: string; rawText: string }, options: Partial<GenOptions>) {
  try {
    const kind = options.customKind === "template" || options.customKind === "raw" ? options.customKind : "simple";
    const lang = options.language === "zh-Hans" || options.language === "en" ? options.language : "zh-Hant";
    const langName = LANG_WORDS[lang];
    const diffWord = options.difficulty === "easy" ? "簡單" : options.difficulty === "hard" ? "困難" : "中等";
    const focus = typeof options.focus === "string" ? options.focus : "";
    const chars = note.rawText.length;
    const custom = typeof options.customCount === "number" ? Math.min(50, Math.max(1, Math.floor(options.customCount))) : undefined;
    const n = custom ?? flashcardCount(chars, (options.count === "less" || options.count === "more" ? options.count : "standard") as CountLevel);
    const key = await getKeyOrThrow();
    let prompt: string;
    if (kind === "simple") {
      const method: SimpleMethod =
        options.customMethod === "points" || options.customMethod === "table" || options.customMethod === "story"
          ? options.customMethod
          : "explain";
      const length: SimpleLength = options.customLength === "short" || options.customLength === "long" ? options.customLength : "standard";
      prompt = withStyle(buildSimplePrompt(method, length, options.customHintFirst === true, langName, focus) + note.rawText.slice(0, 12000), await globalStyle(), false);
    } else {
      let body: string;
      if (kind === "template") {
        const tid = options.customTemplateId || "";
        const builtin = BUILTIN_TEMPLATES.find((t) => t.id === tid);
        if (builtin) {
          body = builtin.body;
        } else {
          const tpl = await db.customTemplate.findUnique({ where: { id: tid } });
          if (!tpl) throw new Error("找不到這個模板（可能已被刪除）");
          body = tpl.body;
        }
      } else {
        body = (options.customBody || "").trim();
        if (!body) throw new Error("自訂 Prompt 是空的");
      }
      const paras = headParagraphs(note.rawText);
      prompt = renderCustomPrompt(body, {
        note: note.rawText.slice(0, 12000),
        paras: paras.map((p) => `[${p.id}] ${p.text}`).join("\n"),
        focus,
        count: n,
        difficulty: diffWord,
        language: langName,
      });
    }
    const { text, usage } = await chatCompletion({
      baseUrl: key.baseUrl,
      apiKey: key.apiKey,
      model: key.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
    });
    await logUsage("custom", key.model, usage);
    // 雙向追蹤：custom 沒有段落對應，跳過（非關鍵）
    await db.generation.update({
      where: { id },
      data: {
        status: "done",
        result: text.trim().slice(0, 40000),
        options: JSON.stringify({ ...options, customKind: kind, resolvedCount: n, chars }),
      },
    });
  } catch (e) {
    await db.generation.update({
      where: { id },
      data: { status: "error", error: e instanceof Error ? e.message.slice(0, 500) : "未知錯誤" },
    });
  }
}

async function runPodcast(id: string, noteId: string, note: { title: string; rawText: string }, options: Partial<GenOptions>) {
  try {
    const mode = options.podcastMode === "dialogue" ? "dialogue" : "read";
    const pair: VoicePairId = options.voicePair === "tw" ? "tw" : "cn";
    const lang = options.language === "zh-Hans" || options.language === "en" ? options.language : "zh-Hant";
    const focus = typeof options.focus === "string" ? options.focus : "";
    const rawText = note.rawText;
    let lines: PodLine[];
    let focused = false;
    if (mode === "dialogue") {
      const key = await getKeyOrThrow();
      const langName = lang === "zh-Hans" ? "简体中文" : lang === "en" ? "English" : "繁體中文";
      const { text, usage } = await chatCompletion({
        baseUrl: key.baseUrl,
        apiKey: key.apiKey,
        model: key.model,
        messages: [{ role: "user", content: withStyle(buildDialoguePrompt(langName, focus) + rawText.slice(0, 12000), await globalStyle(), true) }],
        temperature: 0.7,
      });
      await logUsage("podcast", key.model, usage);
      lines = parseDialogue(text);
      if (lines.length === 0) throw new Error("對話稿產生失敗（模型沒照格式回，再試一次）");
    } else {
      // 朗讀：有聚焦就只讀相關段落（TF 檢索，按原文順序拼回），沒命中才退回全文
      const q = focus.trim().slice(0, 500);
      let body = "";
      if (q) {
        const hits = searchNotes([{ id, title: note.title, rawText }], q, 50, READ_CHAR_CAP);
        if (hits.length > 0) {
          hits.sort((a, b) => parseInt(a.paraId.slice(1), 10) - parseInt(b.paraId.slice(1), 10));
          body = hits.map((h) => h.text).join("\n\n");
          focused = true;
        }
      }
      if (!body) body = rawText.slice(0, READ_CHAR_CAP).trim();
      if (!body) throw new Error("筆記是空的，沒東西可唸");
      lines = splitChunks(body).map((t) => ({ speaker: "A" as const, text: t }));
    }
    const audio = await synthesizeLines(lines, pair);
    const dir = path.join(process.cwd(), "data", "podcasts");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${id}.mp3`), audio);
    // 雙向追蹤：每段用 TF 對應原文段落
    const plinks = lines.map((l) => {
      const hits = searchNotes([{ id: noteId, title: note.title, rawText }], l.text, 1, 500);
      return { noteId, paraId: hits[0]?.paraId ?? "p0", genId: id, kind: "podcast" };
    });
    if (plinks.length > 0) await db.usageLink.createMany({ data: plinks });
    const chars = lines.reduce((a, l) => a + l.text.length, 0);
    await db.generation.update({
      where: { id },
      data: {
        status: "done",
        result: JSON.stringify({ mode, voicePair: pair, lines, chars, focused }),
        options: JSON.stringify({ ...options, podcastMode: mode, voicePair: pair, lineCount: lines.length, chars, focused }),
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
  // 播客 / 自訂走獨立分支
  if (gen.type === "podcast" || gen.type === "custom") {
    let options: Partial<GenOptions> = {};
    try {
      options = JSON.parse(gen.options || "{}") as Partial<GenOptions>;
    } catch {
      /* ignore */
    }
    if (gen.type === "podcast") await runPodcast(id, gen.noteId, { title: gen.note.title, rawText: gen.note.rawText }, options);
    else await runCustom(id, { title: gen.note.title, rawText: gen.note.rawText }, options);
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
      messages: [{ role: "user", content: withStyle(buildPrompt(gen.type as "flashcards" | "quiz" | "mindmap", o, n) + context, await globalStyle(), true) }],
      temperature: 0.5,
    });
    await logUsage(gen.type, key.model, usage);
    // 心智圖：抽引用、驗 ID、存乾淨 md + 映射；其他走 JSON 解析
    if (gen.type === "mindmap") {
      const { cleaned, sourceMap } = extractSourceMap(
        text.trim(),
        new Set(paras.map((p) => p.id)),
      );
      const conflicts = parseConflicts(text);
      // 雙向追蹤：sourceMap 已有 node->para，直接寫 link
      if (sourceMap) {
        const links = Object.values(sourceMap).flat().map((paraId) => ({
          noteId: gen.noteId,
          paraId,
          genId: id,
          kind: "mindmap",
        }));
        if (links.length > 0) await db.usageLink.createMany({ data: links });
      }
      await db.generation.update({
        where: { id },
        data: {
          status: "done",
          result: cleaned,
          options: JSON.stringify({ ...o, customCount: custom, resolvedCount: n, chars, sourceMap, ...(conflicts.length > 0 ? { conflicts } : {}) }),
        },
      });
      return;
    }
    const items = parseJsonArray(text);
    const clean = sanitizeItems(gen.type as "flashcards" | "quiz", items);
      const genNote = gen.note;
      const genNoteId = gen.noteId;
      if (clean.length === 0) throw new Error("模型回傳格式不符（已過濾無效題目，剩 0 題），再按一次生成");
    const conflicts = parseConflicts(text);
    // 雙向追蹤：閃卡/測驗沒有 sourceMap，用 TF 把每題對應到最相關的段落
    {
      const paras = splitParagraphs(genNote.rawText);
      const noteId = genNoteId;
      const links: { noteId: string; paraId: string; genId: string; kind: string }[] = [];
      for (let qi = 0; qi < clean.length; qi++) {
        const item = clean[qi] as { front?: string; question?: string };
        const qtext = item.front || item.question || "";
        if (!qtext) continue;
        const hits = searchNotes([{ id: gen.noteId, title: gen.note.title, rawText: gen.note.rawText }], qtext, 1, 2000);
        const paraId = hits[0]?.paraId ?? paras[0]?.id ?? "p0";
        links.push({ noteId: gen.noteId, paraId, genId: id, kind: gen.type });
      }
      if (links.length > 0) await db.usageLink.createMany({ data: links });
    }
    await db.generation.update({
      where: { id },
      data: {
        status: "done",
        result: JSON.stringify(clean),
        ...(conflicts.length > 0 ? { options: JSON.stringify({ ...o, customCount: custom, resolvedCount: n, chars, conflicts }) } : {}),
      },
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
      const gen = await db.generation.findUnique({ where: { id: input.id } });
      if (!gen || gen.type !== "quiz" || gen.status !== "done" || !gen.result) throw new Error("找不到這份測驗");
      let options: GenOptions = {} as GenOptions;
      try {
        options = JSON.parse(gen.options || "{}") as GenOptions;
      } catch {
        /* ignore */
      }
      const cache = (options.explainCache && typeof options.explainCache === "object") ? options.explainCache : {};
      const key = String(input.qIndex);
      if (cache[key]) return { text: cache[key] };
      const items = JSON.parse(gen.result) as { question: string; options: string[]; answer: number }[];
      const q = items[input.qIndex];
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
        where: { id: input.id },
        data: { options: JSON.stringify({ ...options, explainCache: cache }) },
      });
      return { text: cache[key] };
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
