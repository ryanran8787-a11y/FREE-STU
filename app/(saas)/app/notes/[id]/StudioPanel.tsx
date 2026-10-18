"use client";

import { useState } from "react";
import { CardIcon, PodIcon, QuizIcon, SparkIcon } from "@/app/icons";
import { flashcardCount, quizCount } from "@/lib/counts";
import { CustomSection } from "./CustomSection";

export type StudioGenType = "flashcards" | "quiz" | "mindmap" | "podcast" | "custom";

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-line">
      {options.map((o, i) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${i > 0 ? "border-l border-line" : ""} ${value === o.v ? "invert-chip" : "bg-card hover:bg-paper"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Studio 深模組：選項狀態收斂在內部，對外只有 onGenerate 一條縫。 */
export function StudioPanel({
  noteId,
  rawText,
  chars,
  busy,
  starting,
  onGenerate,
  onCustomStart,
}: {
  noteId: string;
  rawText: string;
  chars: number;
  busy: boolean;
  starting: boolean;
  onGenerate: (args: {
    type: StudioGenType;
    count: "less" | "standard" | "more";
    level: "easy" | "medium" | "hard";
    lang: "zh-Hant" | "zh-Hans" | "en";
    focus?: string;
    customCount?: number;
    pod?: { mode: "read" | "dialogue"; pair: "cn" | "tw" };
  }) => void;
  onCustomStart: (gid: string) => void;
}) {
  const [count, setCount] = useState<"less" | "standard" | "more">("standard");
  const [level, setLevel] = useState<"easy" | "medium" | "hard">("medium");
  const [lang, setLang] = useState<"zh-Hant" | "zh-Hans" | "en">("zh-Hant");
  const [focus, setFocus] = useState("");
  const [custom, setCustom] = useState("");
  const [podMode, setPodMode] = useState<"read" | "dialogue">("read");
  const [podPair, setPodPair] = useState<"cn" | "tw">("cn");

  const customN = (() => {
    const n = parseInt(custom, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(50, n) : null;
  })();
  const fcPreview = customN ?? flashcardCount(chars, count);
  const quizPreview = customN ?? quizCount(chars, count);
  const customCount = customN ?? undefined;
  const disabled = busy || starting;

  return (
    <div className="card rise flex flex-col gap-3 p-4">
      <h2 className="text-sm font-bold">Studio</h2>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted">數量</span>
        <Seg value={count} onChange={setCount} options={[{ v: "less", label: "更少" }, { v: "standard", label: "標準" }, { v: "more", label: "更多" }]} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted">難度</span>
        <Seg value={level} onChange={setLevel} options={[{ v: "easy", label: "簡單" }, { v: "medium", label: "中等" }, { v: "hard", label: "困難" }]} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted">語言</span>
          <select value={lang} onChange={(e) => setLang(e.target.value as typeof lang)} className="field !w-auto text-xs">
            <option value="zh-Hant">繁體中文</option>
            <option value="zh-Hans">简体中文</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted">自訂題數</span>
          <input value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="空=公式" className="field text-xs" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted">主題聚焦（可空）</span>
        <textarea value={focus} onChange={(e) => setFocus(e.target.value)} rows={2} placeholder="例如：只考監護與輔助宣告" className="field resize-y text-xs" />
      </div>
      <div className="flex flex-col gap-2">
        <button onClick={() => onGenerate({ type: "flashcards", count, level, lang, focus, customCount })} disabled={disabled} className="btn-ghost w-full !justify-start text-sm disabled:opacity-50">
          <CardIcon size={16} /> 生成閃卡{chars ? `（${fcPreview} 張）` : ""}
        </button>
        <button onClick={() => onGenerate({ type: "quiz", count, level, lang, focus, customCount })} disabled={disabled} className="btn-ghost w-full !justify-start text-sm disabled:opacity-50">
          <QuizIcon size={16} /> 生成測驗{chars ? `（${quizPreview} 題）` : ""}
        </button>
        <button onClick={() => onGenerate({ type: "mindmap", count, level, lang, focus, customCount })} disabled={disabled} className="btn-ghost w-full !justify-start text-sm disabled:opacity-50">
          <SparkIcon size={16} /> 生成心智圖
        </button>
      </div>
      <div className="flex flex-col gap-1.5 border-t border-line pt-3">
        <span className="text-xs font-semibold text-muted">播客</span>
        <Seg value={podMode} onChange={setPodMode} options={[{ v: "read", label: "朗讀" }, { v: "dialogue", label: "對談" }]} />
        <Seg value={podPair} onChange={setPodPair} options={[{ v: "cn", label: "大陸腔" }, { v: "tw", label: "台灣腔" }]} />
        <button onClick={() => onGenerate({ type: "podcast", count, level, lang, focus: undefined, pod: { mode: podMode, pair: podPair } })} disabled={disabled} className="btn-ghost w-full !justify-start text-sm disabled:opacity-50">
          <PodIcon size={16} /> 生成播客
        </button>
      </div>
      <CustomSection
        noteId={noteId}
        focus={focus}
        count={count}
        level={level}
        lang={lang}
        rawText={rawText}
        busy={busy}
        onStart={onCustomStart}
      />
    </div>
  );
}
