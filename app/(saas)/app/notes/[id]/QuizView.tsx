"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { downloadText, quizToMd, safeName } from "@/lib/export";
import { QuizIcon } from "@/app/icons";
import { EmptyState } from "./ResultCard";

function stripLabel(op: string): string {
  return op.replace(/^[A-D][、．.。:：\s]*/, "");
}

/** T1-3 Top-1：互動吃 quizInteract（無 answer/explanation），判分以 server 回為準；列印/匯出吃 quizPrintable。 */
export function Quiz({ title, genId }: { title: string; genId: string }) {
  const interact = trpc.generation.quizInteract.useQuery({ id: genId });
  const printable = trpc.generation.quizPrintable.useQuery({ id: genId });
  const qs = interact.data?.items ?? [];
  const full = printable.data?.items ?? [];
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [verdict, setVerdict] = useState<Record<number, { correct: boolean; answer: number }>>({});
  const [conf, setConf] = useState<Record<number, "high" | "med" | "low">>({});
  const [explain, setExplain] = useState<Record<number, string>>({});
  const [explainLoading, setExplainLoading] = useState<Set<number>>(new Set());
  const utils = trpc.useUtils();
  const log = trpc.attempt.log.useMutation({
    onSuccess: () => {
      utils.attempt.stats.invalidate();
      utils.review.queue.invalidate();
    },
  });
  const explainMut = trpc.generation.explain.useMutation({
    onSuccess: (data, vars) => {
      setExplain((prev) => ({ ...prev, [vars.qIndex]: data.text }));
      setExplainLoading((s) => { const n = new Set(s); n.delete(vars.qIndex); return n; });
    },
    onError: (e, vars) => {
      setExplain((prev) => ({ ...prev, [vars.qIndex]: `解釋失敗：${e.message}` }));
      setExplainLoading((s) => { const n = new Set(s); n.delete(vars.qIndex); return n; });
    },
  });
  if (interact.isLoading) {
    return <EmptyState icon={<QuizIcon size={28} />} text="測驗載入中…" />;
  }
  if (!interact.data || interact.data.status !== "done" || qs.length === 0) {
    return <EmptyState icon={<QuizIcon size={28} />} text="這份測驗是空的，重新生成一次就會有題目。" />;
  }
  const done = qs.length > 0 && Object.keys(picked).length === qs.length;
  const score = Object.values(verdict).filter((v) => v.correct).length;
  function pick(qi: number, oi: number) {
    if (!genId || picked[qi] !== undefined) return;
    setPicked((p) => ({ ...p, [qi]: oi }));
    log.mutate(
      { genId, qIndex: qi, picked: oi, confidence: conf[qi] ?? "med" },
      {
        onSuccess: (data) => {
          if (typeof (data as { answer?: number }).answer === "number") {
            const d = data as { correct: boolean; answer: number };
            setVerdict((v) => ({ ...v, [qi]: { correct: d.correct, answer: d.answer } }));
          } else {
            const d = data as { correct: boolean };
            setVerdict((v) => ({ ...v, [qi]: { correct: d.correct, answer: -1 } }));
          }
        },
      },
    );
  }
  function askExplain(qi: number) {
    if (!genId || explain[qi] || explainLoading.has(qi)) return;
    setExplainLoading((s) => new Set(s).add(qi));
    explainMut.mutate({ id: genId, qIndex: qi });
  }
  function exportMd() {
    if (full.length > 0) downloadText(`${safeName(title)}-測驗.md`, quizToMd(title, full));
  }
  return (
    <div className="flex flex-col gap-3 print:gap-2 print:[print-color-adjust:exact]">
      <div className="flex items-center print:hidden">
        <button onClick={exportMd} className="ml-auto rounded border border-line px-2 py-0.5 text-xs font-semibold text-muted hover:border-muted hover:text-ink">
          匯出 MD
        </button>
      </div>
      {/* 列印專用標題（螢幕不顯示） */}
      <h2 className="hidden text-lg font-extrabold print:block">{title} — 測驗（共 {full.length || qs.length} 題）</h2>
      {done && (
        <div className="card rise border-accent bg-accent-soft p-4 text-center font-bold text-ink" role="status">
          {score}/{qs.length} 分 {score === qs.length ? "全對！" : score >= qs.length / 2 ? "不錯，錯的再看一次" : "加油，再複習一下"}
        </div>
      )}
      {qs.map((q, qi) => {
        const v = verdict[qi];
        const ans = v?.answer;
        const exp = full[qi]?.explanation;
        return (
        <div key={qi} className="card break-inside-avoid p-4 print:border print:border-neutral-400 print:shadow-none">
          <div className="text-sm font-bold">{qi + 1}. {q.question}</div>
          {/* 列印版正解行（螢幕 hidden，資料走 printable 通道） */}
          <div className="mt-1 hidden text-xs font-semibold print:block">
            {full[qi] ? <>正解：{"ABCD"[full[qi].answer]}．{stripLabel(full[qi].options[full[qi].answer] ?? "")}</> : null}
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] print:hidden" role="radiogroup" aria-label={`第 ${qi + 1} 題信心`}>
            <span className="text-muted">信心：</span>
            {([["high", "有把握"], ["med", "不確定"], ["low", "瞎猜"]] as const).map(([val, label]) => (
              <button
                key={val}
                disabled={picked[qi] !== undefined}
                onClick={() => setConf((c) => ({ ...c, [qi]: val }))}
                role="radio"
                aria-checked={(conf[qi] ?? "med") === val}
                className={`rounded border px-1.5 py-0.5 ${((conf[qi] ?? "med") === val) ? "invert-chip border-ink font-semibold" : "border-line text-muted hover:border-muted"} disabled:opacity-60`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex-col gap-1.5 flex print:hidden" role="list" aria-label={`第 ${qi + 1} 題選項`}>
            {q.options.map((raw, oi) => {
              const op = stripLabel(raw);
              const sel = picked[qi] === oi;
              const show = picked[qi] !== undefined && v !== undefined;
              const correct = ans !== undefined && oi === ans;
              return (
                <button
                  key={oi}
                  onClick={() => pick(qi, oi)}
                  aria-pressed={sel}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    show && correct
                      ? "border-accent bg-accent-soft font-semibold"
                      : show && sel
                        ? "border-red-400 bg-red-50"
                        : "border-line bg-card hover:border-muted"
                  }`}
                >
                  <span className="mr-2 font-mono font-bold text-muted">{"ABCD"[oi]}</span>
                  {op}
                </button>
              );
            })}
          </div>
          {/* 列印版選項清單：純文字、正解標 ★（走 printable） */}
          <ol className="mt-1 hidden list-none text-xs leading-relaxed print:block">
            {(full[qi]?.options ?? q.options).map((raw, oi) => (
              <li key={oi}>
                {"ABCD"[oi]}．{stripLabel(raw)}{full[qi] && oi === full[qi].answer ? " ★" : ""}
              </li>
            ))}
          </ol>
          {picked[qi] !== undefined && v && exp && (
            <div className="mt-2 rounded-md bg-paper px-3 py-2 text-xs leading-relaxed text-muted print:border print:border-neutral-300">
              <span className="font-bold text-ink">解析：</span>{exp}
            </div>
          )}
          {picked[qi] !== undefined && v && !v.correct && (
            <div className="mt-2 print:hidden">
              <button
                onClick={() => askExplain(qi)}
                disabled={explainLoading.has(qi)}
                className="rounded border border-accent bg-accent-soft px-2 py-1 text-xs font-semibold text-ink disabled:opacity-50"
              >
                {explainLoading.has(qi) ? "解釋中…" : explain[qi] ? "重新解釋" : "要解釋（三角度）"}
              </button>
              {explain[qi] && (
                <div className="mt-2 whitespace-pre-wrap rounded-md border border-accent bg-accent-soft px-3 py-2 text-xs leading-relaxed">
                  {explain[qi]}
                </div>
              )}
            </div>
          )}
        </div>
        );
      })}
      {done && (
        <button onClick={() => { setPicked({}); setVerdict({}); }} className="btn-ghost self-center text-sm print:hidden">
          再考一次
        </button>
      )}
    </div>
  );
}
