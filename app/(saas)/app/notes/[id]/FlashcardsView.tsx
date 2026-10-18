"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { downloadText, flashcardsToMd, safeName } from "@/lib/export";

export type Flashcard = { front: string; back: string };

/** Flashcards 深模組：翻卡 + 自評 + 匯出 MD，全部收在內部。 */
export function Flashcards({ result, title, genId }: { result: string; title: string; genId: string }) {
  const cards = JSON.parse(result) as Flashcard[];
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const utils = trpc.useUtils();
  const log = trpc.attempt.log.useMutation({ onSuccess: () => utils.attempt.stats.invalidate() });
  if (cards.length === 0) return <p className="text-sm text-muted">空的。</p>;
  const c = cards[Math.min(i, cards.length - 1)];
  function grade(correct: boolean, confidence: "high" | "med" | "low") {
    if (genId) log.mutate({ genId, qIndex: Math.min(i, cards.length - 1), correct, confidence });
    setI((v) => Math.min(v + 1, cards.length - 1));
    setFlip(false);
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center">
        <button onClick={() => downloadText(`${safeName(title)}-閃卡.md`, flashcardsToMd(title, cards))} className="ml-auto rounded border border-line px-2 py-0.5 text-xs font-semibold text-muted hover:border-muted hover:text-ink">
          匯出 MD
        </button>
      </div>
      <div className="flip-scene">
        <div className={`flip-inner ${flip ? "flipped" : ""}`} onClick={() => setFlip(!flip)}>
          <div className="flip-face card flex min-h-44 cursor-pointer flex-col items-center justify-center p-6 text-center">
            <div className="text-xs font-semibold text-muted">題面 {i + 1}/{cards.length} · 點我翻面</div>
            <div className="mt-2 text-lg font-bold">{c.front}</div>
          </div>
          <div className="flip-face flip-back card flex min-h-44 cursor-pointer flex-col items-center justify-center bg-paper p-6 text-center">
            <div className="text-xs font-semibold text-muted">答案 · 點我翻回</div>
            <div className="mt-2">{c.back}</div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button disabled={i === 0} onClick={() => { setI(i - 1); setFlip(false); }} className="btn-ghost !px-4 !py-1.5 text-sm">← 上張</button>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((i + 1) / cards.length) * 100}%` }} />
        </div>
        <button disabled={i >= cards.length - 1} onClick={() => { setI(i + 1); setFlip(false); }} className="btn-ghost !px-4 !py-1.5 text-sm">下張 →</button>
      </div>
      {flip && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <span className="text-muted">自評：</span>
          <button onClick={() => grade(true, "high")} className="rounded border border-line px-3 py-1.5 font-semibold hover:border-muted">記得</button>
          <button onClick={() => grade(true, "med")} className="rounded border border-line px-3 py-1.5 hover:border-muted">模糊</button>
          <button onClick={() => grade(false, "low")} className="rounded border border-line px-3 py-1.5 hover:border-red-400 hover:text-red-600">忘了</button>
        </div>
      )}
    </div>
  );
}
