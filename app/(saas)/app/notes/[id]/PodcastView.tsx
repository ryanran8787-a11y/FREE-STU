"use client";

import { useState } from "react";
import { safeName } from "@/lib/export";
import type { PodLine } from "@/server/podcast";

type PodResult = { mode: "read" | "dialogue"; voicePair: string; lines: PodLine[]; chars: number };

/** 播客結果：Edge 高品質音檔 + 逐字稿；Edge 掛掉時可用瀏覽器內建語音降級試聽。 */
export function PodcastView({ result, title, genId }: { result: string; title: string; genId: string }) {
  const [speaking, setSpeaking] = useState(false);
  let parsed: PodResult | null = null;
  try {
    parsed = JSON.parse(result) as PodResult;
  } catch {
    return <p className="whitespace-pre-wrap text-sm text-red-500">解析失敗，原文：{result.slice(0, 500)}</p>;
  }
  if (!parsed || !Array.isArray(parsed.lines)) {
    return <p className="text-sm text-red-500">播客資料損壞。</p>;
  }
  const mins = Math.max(1, Math.round(parsed.chars / 250));
  const fullText = parsed.lines.map((l) => (parsed!.mode === "dialogue" ? `${l.speaker === "A" ? "主持人" : "講解"}：${l.text}` : l.text)).join("\n");

  function browserRead() {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(fullText);
    u.lang = "zh-TW";
    u.rate = 1;
    const v = window.speechSynthesis.getVoices().find((x) => x.lang.startsWith("zh"));
    if (v) u.voice = v;
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col gap-2 bg-paper p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="rounded border border-line px-1.5 py-0.5 font-semibold">
            {parsed.mode === "dialogue" ? "雙人對談" : "原文朗讀"}
          </span>
          <span>約 {mins} 分鐘 · {parsed.chars} 字</span>
        </div>
        {genId ? (
          <>
            <audio controls preload="metadata" src={`/api/podcast/${genId}`} className="w-full" />
            <div className="flex flex-wrap gap-2">
              <a href={`/api/podcast/${genId}?download=1`} download={`${safeName(title)}-播客.mp3`} className="rounded border border-line px-2 py-0.5 text-xs font-semibold text-muted hover:border-muted hover:text-ink">
                下載 MP3
              </a>
              <button onClick={browserRead} className="rounded border border-line px-2 py-0.5 text-xs font-semibold text-muted hover:border-muted hover:text-ink">
                {speaking ? "停止試聽" : "瀏覽器試聽（降級）"}
              </button>
            </div>
          </>
        ) : (
          <button onClick={browserRead} className="btn-ghost self-start text-sm">
            {speaking ? "停止試聽" : "瀏覽器試聽"}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {parsed.lines.map((l, i) => (
          <div key={i} className="card p-3 text-sm leading-relaxed">
            {parsed!.mode === "dialogue" && (
              <div className={`mb-1 text-xs font-bold ${l.speaker === "A" ? "text-primary" : "text-accent"}`}>
                {l.speaker === "A" ? "主持人" : "講解"}
              </div>
            )}
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}
