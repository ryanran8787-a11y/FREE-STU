"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

type Gen = { id: string; type: string; status: string; result: string | null; error: string | null };

function Flashcards({ result }: { result: string }) {
  const cards = JSON.parse(result) as { front: string; back: string }[];
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  if (cards.length === 0) return <p>空的。</p>;
  const c = cards[Math.min(i, cards.length - 1)];
  return (
    <div className="flex flex-col gap-2">
      <div onClick={() => setFlip(!flip)} className="cursor-pointer rounded border p-4 text-center">
        <div className="text-xs text-gray-500">{flip ? "答案（點我翻回）" : `題面 ${i + 1}/${cards.length}（點我看答案）`}</div>
        <div className="mt-2">{flip ? c.back : c.front}</div>
      </div>
      <div className="flex gap-2">
        <button disabled={i === 0} onClick={() => { setI(i - 1); setFlip(false); }} className="rounded border px-3 py-1 text-sm disabled:opacity-50">上張</button>
        <button disabled={i >= cards.length - 1} onClick={() => { setI(i + 1); setFlip(false); }} className="rounded border px-3 py-1 text-sm disabled:opacity-50">下張</button>
      </div>
    </div>
  );
}

function Quiz({ result }: { result: string }) {
  const qs = JSON.parse(result) as { question: string; options: string[]; answer: number }[];
  const [picked, setPicked] = useState<Record<number, number>>({});
  return (
    <div className="flex flex-col gap-4">
      {qs.map((q, qi) => (
        <div key={qi} className="rounded border p-3">
          <div className="font-bold text-sm">{qi + 1}. {q.question}</div>
          <div className="mt-2 flex flex-col gap-1">
            {q.options.map((op, oi) => {
              const sel = picked[qi] === oi;
              const show = picked[qi] !== undefined;
              const correct = oi === q.answer;
              return (
                <button
                  key={oi}
                  onClick={() => setPicked((p) => ({ ...p, [qi]: oi }))}
                  className={`rounded border px-2 py-1 text-left text-sm ${show && correct ? "border-green-500" : ""} ${show && sel && !correct ? "border-red-500" : ""}`}
                >
                  {op}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NotePage({ params }: { params: { id: string } }) {
  const note = trpc.note.get.useQuery({ id: params.id });
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
    const res = await start.mutateAsync({ noteId: params.id, type });
    setPollId(res.id);
  }

  const live: Gen | null = poll.data && pollId ? { id: pollId, type: "", status: poll.data.status, result: poll.data.result, error: poll.data.error } : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{note.data?.title ?? "讀取中…"}</h1>
      {note.data && <p className="whitespace-pre-wrap rounded border p-3 text-sm">{note.data.rawText.slice(0, 2000)}{note.data.rawText.length > 2000 && "…"}</p>}
      <div className="flex gap-2">
        <button onClick={() => gen("flashcards")} disabled={start.isPending} className="rounded border px-4 py-2 text-sm disabled:opacity-50">生成閃卡</button>
        <button onClick={() => gen("quiz")} disabled={start.isPending} className="rounded border px-4 py-2 text-sm disabled:opacity-50">生成測驗</button>
      </div>
      {live && live.status !== "done" && live.status !== "error" && <p className="text-sm text-gray-500">生成中…（{live.status}，自動輪詢）</p>}
      {live?.status === "error" && <p className="text-sm text-red-500">失敗：{live.error}</p>}
      {live?.status === "done" && live.result && (
        <div>
          <h2 className="mb-2 font-bold">這次生成</h2>
          <GenView result={live.result} />
        </div>
      )}
      {note.data?.generations.filter((g) => g.status === "done" && g.result).map((g) => (
        <div key={g.id}>
          <h2 className="mb-2 font-bold">{g.type === "flashcards" ? "閃卡" : "測驗"} <span className="text-xs font-normal text-gray-500">{g.id.slice(0, 8)}</span></h2>
          <GenView result={g.result!} />
        </div>
      ))}
    </div>
  );
}

function guessType(result: string): string {
  try {
    const arr = JSON.parse(result) as Record<string, unknown>[];
    if (arr.length > 0 && "options" in arr[0]) return "quiz";
  } catch { /* ignore */ }
  return "flashcards";
}

function GenView({ result }: { result: string }) {
  try {
    if (guessType(result) === "quiz") return <Quiz result={result} />;
    return <Flashcards result={result} />;
  } catch {
    return <p className="whitespace-pre-wrap text-sm text-red-500">解析失敗，原文：{result.slice(0, 500)}</p>;
  }
}
