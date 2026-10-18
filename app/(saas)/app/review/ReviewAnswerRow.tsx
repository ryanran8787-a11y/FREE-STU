"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

export type DueItem = {
  genId: string;
  qIndex: number;
  kind: string;
  noteId: string;
  question: string;
  reason: string;
  intervalDays: number;
};

type QuizQ = { question: string; options: string[]; answer: number };
type CardQ = { front: string; back: string };

/** Review 原地作答行：展開 → 按需查 generation 拿選項/卡背 → 作答打 attempt.log → 回報 onAnswered。 */
export function ReviewAnswerRow({ item, onAnswered }: { item: DueItem; onAnswered: (r: { genId: string; qIndex: number; correct: boolean }) => void }) {
  const [open, setOpen] = useState(false);
  const [conf, setConf] = useState<"high" | "med" | "low">("med");
  const [done, setDone] = useState<null | boolean>(null);
  const utils = trpc.useUtils();
  // B1：plan 卡 genId=planId（無 generation），查詢要跳過；完成=刪卡（unpinTask）。
  const gen = trpc.generation.getStatus.useQuery({ id: item.genId }, { enabled: open && item.kind !== "plan" });
  const unpin = trpc.plan.unpinTask.useMutation({
    onSuccess: () => {
      utils.review.queue.invalidate();
    },
  });
  const [planDone, setPlanDone] = useState(false);
  const log = trpc.attempt.log.useMutation({
    onSuccess: () => {
      utils.attempt.stats.invalidate();
      utils.review.queue.invalidate();
    },
  });

  function answerQuiz(q: QuizQ, oi: number) {
    if (done !== null) return;
    const correct = oi === q.answer;
    setDone(correct);
    log.mutate({ genId: item.genId, qIndex: item.qIndex, picked: oi, correct, confidence: conf });
    onAnswered({ genId: item.genId, qIndex: item.qIndex, correct });
  }

  function grade(correct: boolean, c: "high" | "med" | "low") {
    if (done !== null) return;
    setDone(correct);
    log.mutate({ genId: item.genId, qIndex: item.qIndex, correct, confidence: c });
    onAnswered({ genId: item.genId, qIndex: item.qIndex, correct });
  }

  let body: React.ReactNode = null;
  if (open) {
    if (item.kind === "plan") {
      // B1：plan 卡無 generation，直接顯示快照文字；「完成了」= unpin（qIndex=dayIndex*100+taskIndex 解碼）。
      body = planDone ? (
        <p className="mt-2 text-xs font-semibold" role="status">完成！已從佇列移除。</p>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <button
            disabled={unpin.isPending}
            onClick={() => {
              const day = Math.floor(item.qIndex / 100) + 1;
              const taskIndex = item.qIndex % 100;
              unpin.mutate(
                { planId: item.genId, day, taskIndex },
                { onSuccess: () => { setPlanDone(true); onAnswered({ genId: item.genId, qIndex: item.qIndex, correct: true }); } },
              );
            }}
            aria-pressed={false}
            className="rounded border border-line bg-card px-3 py-1.5 text-xs font-semibold hover:border-muted disabled:opacity-60"
          >
            {unpin.isPending ? "處理中…" : "完成了，從佇列移除"}
          </button>
        </div>
      );
    } else if (gen.isLoading) body = <p className="mt-2 text-xs text-muted">載入題目中…</p>;
    else if (!gen.data?.result) body = <p className="mt-2 text-xs text-muted">題目已刪除或載入失敗，去筆記頁查看。</p>;
    else {
      try {
        if (item.kind === "quiz") {
          const qs = JSON.parse(gen.data.result) as QuizQ[];
          const q = qs[item.qIndex];
          body = !q ? (
            <p className="mt-2 text-xs text-muted">題號越界，該卡下次不會再出現。</p>
          ) : (
            <div className="mt-2 flex flex-col gap-1.5">
              <div className="flex items-center gap-1 text-[11px]" role="radiogroup" aria-label="信心">
                <span className="text-muted">信心：</span>
                {([["high", "有把握"], ["med", "不確定"], ["low", "瞎猜"]] as const).map(([v, label]) => (
                  <button
                    key={v}
                    disabled={done !== null}
                    onClick={() => setConf(v)}
                    role="radio"
                    aria-checked={conf === v}
                    className={`rounded border px-1.5 py-0.5 ${conf === v ? "invert-chip border-ink font-semibold" : "border-line text-muted hover:border-muted"} disabled:opacity-60`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {q.options.map((op, oi) => (
                <button
                  key={oi}
                  disabled={done !== null}
                  onClick={() => answerQuiz(q, oi)}
                  aria-pressed={done !== null && oi === q.answer}
                  className={`rounded-md border px-3 py-2 text-left text-sm ${
                    done !== null && oi === q.answer
                      ? "border-accent bg-accent-soft font-semibold"
                      : done !== null && done === false
                        ? "border-line bg-card opacity-70"
                        : "border-line bg-card hover:border-muted"
                  }`}
                >
                  <span className="mr-2 font-mono font-bold text-muted">{"ABCD"[oi] ?? oi}</span>
                  {op}
                </button>
              ))}
              {done !== null && (
                <p className="text-xs font-semibold" role="status">
                  {done ? "答對了！已排下一次。" : "記下來了，稍後本輪再練一次。"}
                </p>
              )}
            </div>
          );
        } else {
          const cards = JSON.parse(gen.data.result) as CardQ[];
          const c = cards[item.qIndex];
          body = !c ? (
            <p className="mt-2 text-xs text-muted">題號越界，該卡下次不會再出現。</p>
          ) : (
            <div className="mt-2 flex flex-col gap-1.5">
              <p className="rounded-md bg-paper px-3 py-2 text-sm">{c.back}</p>
              {done === null ? (
                <div className="flex items-center gap-2 text-xs" role="group" aria-label="自評">
                  <button onClick={() => grade(true, "high")} aria-pressed={false} className="rounded border border-line px-3 py-1.5 font-semibold hover:border-muted">記得</button>
                  <button onClick={() => grade(true, "med")} aria-pressed={false} className="rounded border border-line px-3 py-1.5 hover:border-muted">模糊</button>
                  <button onClick={() => grade(false, "low")} aria-pressed={false} className="rounded border border-line px-3 py-1.5 hover:border-red-400 hover:text-red-600">忘了</button>
                </div>
              ) : (
                <p className="text-xs font-semibold" role="status">
                  {done ? "很好，已排下一次。" : "沒關係，稍後本輪再看一次。"}
                </p>
              )}
            </div>
          );
        }
      } catch {
        body = <p className="mt-2 text-xs text-muted">題目解析失敗。</p>;
      }
    }
  }

  return (
    <li className="flex flex-col gap-1 text-sm" role="listitem">
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded border border-line bg-paper px-1.5 py-0.5 text-[10px] text-muted">
          {item.kind === "quiz" ? "測驗" : item.kind === "plan" ? "計畫" : "閃卡"}
        </span>
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 truncate text-left hover:underline" title={item.question} aria-expanded={open}>
          {item.question}
        </button>
        <span className="shrink-0 text-[11px] text-muted" title={`下次間隔 ${item.intervalDays} 天`}>
          {item.reason}
        </span>
      </div>
      {body}
    </li>
  );
}
