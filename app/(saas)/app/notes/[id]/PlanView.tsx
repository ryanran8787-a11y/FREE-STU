"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { SparkIcon } from "@/app/icons";

/** 學習計畫：選筆記＋天數/難度 → AI 生成每日排程（主題拆解＋段落引用） */
export function PlanView({ noteId, title }: { noteId: string; title: string }) {
  const [days, setDays] = useState(7);
  const [level, setLevel] = useState<"easy" | "medium" | "hard">("medium");
  const [lang, setLang] = useState<"zh-Hant" | "zh-Hans" | "en">("zh-Hant");
  const [pollId, setPollId] = useState<string | null>(null);
  const start = trpc.plan.start.useMutation();
  const list = trpc.plan.list.useQuery({ noteId });
  const utils = trpc.useUtils();
  const poll = trpc.plan.status.useQuery({ id: pollId ?? "" }, { enabled: !!pollId, refetchInterval: (q) => (q.state.data?.status === "done" || q.state.data?.status === "error" ? false : 2000) });

  useEffect(() => {
    if (poll.data?.status === "done") {
      setPollId(null);
      list.refetch();
    }
  }, [poll.data?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = !!pollId && poll.data?.status !== "done" && poll.data?.status !== "error";

  async function generate() {
    const res = await start.mutateAsync({ noteId, days, difficulty: level, language: lang });
    setPollId(res.id);
  }

  const plans = list.data ?? [];
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const active = plans.find((p) => p.id === (selectedPlan ?? plans[0]?.id)) ?? null;
  let parsed: { day: number; title: string; tasks: string[] }[] | null = null;
  if (active?.result) {
    try { parsed = JSON.parse(active.result); } catch { parsed = null; }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-bold">生成學習計畫</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-muted">天數</span>
          <input type="number" min={1} max={30} value={days} onChange={(e) => setDays(Math.min(30, Math.max(1, parseInt(e.target.value, 10) || 1)))} className="field !w-16 text-xs" />
          <span className="font-semibold text-muted">難度</span>
          <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)} className="field !w-auto text-xs">
            <option value="easy">簡單</option>
            <option value="medium">中等</option>
            <option value="hard">困難</option>
          </select>
          <span className="font-semibold text-muted">語言</span>
          <select value={lang} onChange={(e) => setLang(e.target.value as typeof lang)} className="field !w-auto text-xs">
            <option value="zh-Hant">繁體中文</option>
            <option value="zh-Hans">简体中文</option>
            <option value="en">English</option>
          </select>
          <button onClick={generate} disabled={start.isPending || busy} className="btn-primary ml-auto !px-4 !py-1.5 text-xs disabled:opacity-50">
            {busy ? "生成中…" : "生成計畫"}
          </button>
        </div>
        {poll.data?.status === "error" && <p className="text-xs text-red-500">{poll.data.error}</p>}
      </div>

      {plans.length > 0 && (
        <div className="flex flex-col gap-3">
          {plans.length > 1 && (
            <select value={active?.id ?? ""} onChange={(e) => setSelectedPlan(e.target.value)} className="field !w-auto self-start text-xs">
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {new Date(p.createdAt).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })} · {p.days} 天
                </option>
              ))}
            </select>
          )}
          {active?.status === "pending" || active?.status === "running" ? (
            <div className="card flex items-center gap-3 p-4 text-sm font-medium">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
              計畫生成中…
            </div>
          ) : active?.status === "error" ? (
            <div className="card border-l-4 !border-l-red-400 p-4 text-sm">失敗：{active.error}</div>
          ) : parsed ? (
            <div className="flex flex-col gap-3">
              {parsed.map((d) => (
                <div key={d.day} className="card p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{d.day}</span>
                    <h3 className="text-sm font-bold">{d.title}</h3>
                  </div>
                  <ul className="mt-2 flex flex-col gap-1">
                    {d.tasks.map((t, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                        <span className="mt-0.5 text-muted">•</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
