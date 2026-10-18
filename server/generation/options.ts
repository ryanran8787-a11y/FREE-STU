import { z } from "zod";

export const generationType = z.enum(["flashcards", "quiz", "mindmap", "podcast", "custom"]);
export const countLevel = z.enum(["less", "standard", "more"]);
export const difficulty = z.enum(["easy", "medium", "hard"]);
export const language = z.enum(["zh-Hant", "zh-Hans", "en"]);
export const podcastMode = z.enum(["read", "dialogue"]);
export const voicePair = z.enum(["cn", "tw"]);
export const customKind = z.enum(["simple", "template", "raw"]);
export const customMethod = z.enum(["explain", "points", "table", "story"]);
export const customLength = z.enum(["short", "standard", "long"]);

export type GenerationType = z.infer<typeof generationType>;
export type CountLevelOpt = z.infer<typeof countLevel>;
export type DifficultyOpt = z.infer<typeof difficulty>;
export type LanguageOpt = z.infer<typeof language>;

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

export const DIFF_WORDS: Record<string, string> = {
  easy: "簡單（基礎記憶、定義）",
  medium: "中等（理解應用）",
  hard: "困難（綜合分析、陷阱題）",
};

export const LANG_WORDS: Record<string, string> = {
  "zh-Hant": "繁體中文",
  "zh-Hans": "简体中文",
  en: "English",
};

/** 把 DB options JSON 轉成有預設值的 GenOptions（partial 輸入也吃） */
export function normalizeOptions(raw: unknown): GenOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<GenOptions>;
  return {
    count: o.count === "less" || o.count === "more" ? o.count : "standard",
    difficulty: o.difficulty === "easy" || o.difficulty === "hard" ? o.difficulty : "medium",
    language: o.language === "zh-Hans" || o.language === "en" ? o.language : "zh-Hant",
    focus: typeof o.focus === "string" ? o.focus : "",
    ...(o.customCount !== undefined ? { customCount: o.customCount } : {}),
    ...(o.podcastMode !== undefined ? { podcastMode: o.podcastMode } : {}),
    ...(o.voicePair !== undefined ? { voicePair: o.voicePair } : {}),
    ...(o.customKind !== undefined ? { customKind: o.customKind } : {}),
    ...(o.customMethod !== undefined ? { customMethod: o.customMethod } : {}),
    ...(o.customLength !== undefined ? { customLength: o.customLength } : {}),
    ...(o.customHintFirst !== undefined ? { customHintFirst: o.customHintFirst } : {}),
    ...(o.customTemplateId !== undefined ? { customTemplateId: o.customTemplateId } : {}),
    ...(o.customBody !== undefined ? { customBody: o.customBody } : {}),
    ...(o.explainCache !== undefined ? { explainCache: o.explainCache } : {}),
  };
}

/** 自訂題數 clamp：1~50，非法回 undefined（呼叫端再按字數公式） */
export function normalizeCustomCount(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return Math.min(50, Math.max(1, Math.floor(raw)));
}

export function safeParseOptions(json: string | null | undefined): Partial<GenOptions> {
  try {
    return JSON.parse(json || "{}") as Partial<GenOptions>;
  } catch {
    return {};
  }
}
