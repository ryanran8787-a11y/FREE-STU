"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { downloadText, quizToMd, safeName } from "@/lib/export";

function stripLabel(op: string): string {
  return op.replace(/^[A-D][、．.。:：\s]*/, "");
}

export type QuizQuestion = { question: string; options: string[]; answer: number; explanation?: string };

/** Quiz 深模組：答題 + 信心 + 解釋 + 匯出 MD，全部收在內部。 */
export function Quiz({ result, title, genId }: { result: string; title: string; genId: string }) {
  const qs = JSON.parse(result) as QuizQuestion[];
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [conf, setConf] = useState<Record<number, "high" | "med" | "low">>({});
  const [explain, setExplain] = useState<Record<number, string>>({});
  const [explainLoading, setExplainLoading] = useState<Set<number>>(new Set());
  const utils = trpc.useUtils();
  const log = trpc.attempt.log.useMutation({ onSuccess: () => utils.attempt.stats.invalidate() });
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
  const done = Object.keys(picked).length === qs.length;
  const score = qs.filter((q, qi) => picked[qi] === q.answer).length;
  function pick(qi: number, oi: number, correct: boolean) {
    if (genId) log.mutate({ genId, qIndex: qi, picked: oi, correct, confidence: conf[qi] ?? "med" });
    setPicked((p) => (p[qi] !== undefined ? p : { ...p, [qi]: oi }));
  }
  function askExplain(qi: number) {
    if (!genId || explain[qi] || explainLoading.has(qi)) return;
    setExplainLoading((s) => new Set(s).add(qi));
    explainMut.mutate({ id: genId, qIndex: qi });
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center">
        <button onClick={() => downloadText(`${safeName(title)}-測驗.md`, quizToMd(title, qs))} className="ml-auto rounded border border-line px-2 py-0.5 text-xs font-semibold text-muted hover:border-muted hover:text-ink">
          匯出 MD
        </button>
      </div>
      {done && (
        <div className="card rise border-accent bg-accent-soft p-4 text-center font-bold text-ink">
          {score}/{qs.length} 分 {score === qs.length ? "全對！" : score >= qs.length / 2 ? "不錯，錯的再看一次" : "加油，再複習一下"}
        </div>
      )}
      {qs.map((q, qi) => (
        <div key={qi} className="card p-4">
          <div className="text-sm font-bold">{qi + 1}. {q.question}</div>
          <div className="mt-2 flex items-center gap-1 text-[11px]">
            <span className="text-muted">信心：</span>
            {([["high", "有把握"], ["med", "不確定"], ["low", "瞎猜"]] as const).map(([v, label]) => (
              <button
                key={v}
                disabled={picked[qi] !== undefined}
                onClick={() => setConf((c) => ({ ...c, [qi]: v }))}
                className={`rounded border px-1.5 py-0.5 ${((conf[qi] ?? "med") === v) ? "invert-chip border-ink font-semibold" : "border-line text-muted hover:border-muted"} disabled:opacity-60`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            {q.options.map((raw, oi) => {
              const op = stripLabel(raw);
              const sel = picked[qi] === oi;
              const show = picked[qi] !== undefined;
              const correct = oi === q.answer;
              return (
                <button
                  key={oi}
                  onClick={() => pick(qi, oi, oi === q.answer)}
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
          {picked[qi] !== undefined && q.explanation && (
            <div className="mt-2 rounded-md bg-paper px-3 py-2 text-xs leading-relaxed text-muted">
              <span className="font-bold text-ink">解析：</span>{q.explanation}
            </div>
          )}
          {picked[qi] !== undefined && picked[qi] !== q.answer && (
            <div className="mt-2">
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
      ))}
      {done && (
        <button onClick={() => setPicked({})} className="btn-ghost self-center text-sm">
          再考一次
        </button>
      )}
    </div>
  );
}
