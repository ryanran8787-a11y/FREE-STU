"use client";

import { useEffect, useState } from "react";
import { CardIcon, QuizIcon, SparkIcon } from "@/app/icons";
import { trpc } from "@/lib/trpc";

type Gen = { id: string; status: string; result: string | null; error: string | null };

function Flashcards({ result }: { result: string }) {
  const cards = JSON.parse(result) as { front: string; back: string }[];
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  if (cards.length === 0) return <p className="text-sm text-muted">空的。</p>;
  const c = cards[Math.min(i, cards.length - 1)];
  return (
    <div className="flex flex-col gap-3">
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
    </div>
  );
}

function Quiz({ result }: { result: string }) {
  const qs = JSON.parse(result) as { question: string; options: string[]; answer: number }[];
  const [picked, setPicked] = useState<Record<number, number>>({});
  const done = Object.keys(picked).length === qs.length;
  const score = qs.filter((q, qi) => picked[qi] === q.answer).length;
  return (
    <div className="flex flex-col gap-3">
      {done && (
        <div className="card rise border-accent bg-accent-soft p-4 text-center font-bold text-ink">
          {score}/{qs.length} 分 {score === qs.length ? "全對！" : score >= qs.length / 2 ? "不錯，錯的再看一次" : "加油，再複習一下"}
        </div>
      )}
      {qs.map((q, qi) => (
        <div key={qi} className="card p-4">
          <div className="text-sm font-bold">{qi + 1}. {q.question}</div>
          <div className="mt-2 flex flex-col gap-1.5">
            {q.options.map((op, oi) => {
              const sel = picked[qi] === oi;
              const show = picked[qi] !== undefined;
              const correct = oi === q.answer;
              return (
                <button
                  key={oi}
                  onClick={() => setPicked((p) => (p[qi] !== undefined ? p : { ...p, [qi]: oi }))}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    show && correct
                      ? "border-accent bg-accent-soft font-semibold"
                      : show && sel
                        ? "border-red-400 bg-red-50"
                        : "border-line bg-card hover:border-muted"
                  }`}
                >
                  {op}
                </button>
              );
            })}
          </div>
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

function GenView({ result }: { result: string }) {
  try {
    const arr = JSON.parse(result) as Record<string, unknown>[];
    if (arr.length > 0 && "options" in arr[0]) return <Quiz result={result} />;
    return <Flashcards result={result} />;
  } catch {
    return <p className="whitespace-pre-wrap text-sm text-red-500">解析失敗，原文：{result.slice(0, 500)}</p>;
  }
}

export function NoteDetail({ id }: { id: string }) {
  const note = trpc.note.get.useQuery({ id });
  const start = trpc.generation.start.useMutation();
  const [pollId, setPollId] = useState<string | null>(null);
  const poll = trpc.generation.getStatus.useQuery(
    { id: pollId ?? "" },
    { enabled: !!pollId, refetchInterval: (q) => (q.state.data?.status === "done" || q.state.data?.status === "error" ? false : 2000) },
  );

  useEffect(() => {
    if (poll.data?.status === "done" || poll.data?.status === "error") {
      note.refetch();
    }
  }, [poll.data?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function gen(type: "flashcards" | "quiz") {
    const res = await start.mutateAsync({ noteId: id, type });
    setPollId(res.id);
  }

  const live: Gen | null =
    poll.data && pollId
      ? { id: pollId, status: poll.data.status, result: poll.data.result, error: poll.data.error }
      : null;
  const busy = live && live.status !== "done" && live.status !== "error";

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-extrabold tracking-tight">{note.data?.title ?? "讀取中…"}</h1>
      {note.data && (
        <details className="card p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-muted">查看原文（{note.data.rawText.length} 字）</summary>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed">
            {note.data.rawText.slice(0, 2000)}
            {note.data.rawText.length > 2000 && "…"}
          </p>
        </details>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <button onClick={() => gen("flashcards")} disabled={start.isPending || !!busy} className="card group flex items-center gap-4 p-5 text-left transition-shadow hover:shadow-md disabled:opacity-50">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-paper"><CardIcon size={22} /></span>
          <span>
            <span className="block font-semibold group-hover:text-accent">生成閃卡</span>
            <span className="block text-xs text-muted">8 張抽認卡，翻卡複習</span>
          </span>
        </button>
        <button onClick={() => gen("quiz")} disabled={start.isPending || !!busy} className="card group flex items-center gap-4 p-5 text-left transition-shadow hover:shadow-md disabled:opacity-50">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-paper"><QuizIcon size={22} /></span>
          <span>
            <span className="block font-semibold group-hover:text-accent">生成測驗</span>
            <span className="block text-xs text-muted">5 題單選，即答即改</span>
          </span>
        </button>
      </div>

      {busy && (
        <div className="card flex items-center gap-3 p-4 text-sm font-medium">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
          AI 出題中…（{live?.status}，好了自動出現）
        </div>
      )}
      {live?.status === "error" && (
        <div className="card border-l-4 !border-l-red-400 p-4 text-sm">失敗：{live.error}</div>
      )}
      {live?.status === "done" && live.result && (
        <div className="rise">
          <h2 className="mb-2 flex items-center gap-1.5 font-bold"><SparkIcon size={16} /> 剛出爐</h2>
          <GenView result={live.result} />
        </div>
      )}

      {note.data?.generations.filter((g) => g.status === "done" && g.result).map((g) => (
        <div key={g.id}>
          <h2 className="mb-2 flex items-center gap-1.5 font-bold">
            {g.type === "flashcards" ? <CardIcon size={16} /> : <QuizIcon size={16} />}
            {g.type === "flashcards" ? "閃卡" : "測驗"}
            <span className="ml-1 text-xs font-normal text-muted">{new Date(g.createdAt).toLocaleString("zh-TW")}</span>
          </h2>
          <GenView result={g.result!} />
        </div>
      ))}
    </div>
  );
}
