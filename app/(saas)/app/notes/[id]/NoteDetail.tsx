"use client";

import { useEffect, useState } from "react";
import { CardIcon, QuizIcon, SparkIcon } from "@/app/icons";
import { flashcardCount, quizCount } from "@/lib/counts";
import { splitParagraphs } from "@/lib/paras";
import { trpc } from "@/lib/trpc";
import { MindmapView, countMindmapNodes } from "./MindmapView";

type Gen = { id: string; type: string; status: string; result: string | null; error: string | null };

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

function stripLabel(op: string): string {
  return op.replace(/^[A-D][、．.。:：\s]*/, "");
}

function Quiz({ result }: { result: string }) {
  const qs = JSON.parse(result) as { question: string; options: string[]; answer: number; explanation?: string }[];
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
            {q.options.map((raw, oi) => {
              const op = stripLabel(raw);
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

function GenView({ result, type, sources, paras, onGenerate }: { result: string; type: string; sources: Record<string, string[]>; paras: { id: string; text: string }[]; onGenerate?: (type: "flashcards" | "quiz", focus: string) => void }) {
  if (type === "mindmap") return <MindmapView result={result} sources={sources} paras={paras} onGenerate={onGenerate} />;
  try {
    const arr = JSON.parse(result) as Record<string, unknown>[];
    if (arr.length > 0 && "options" in arr[0]) return <Quiz result={result} />;
    return <Flashcards result={result} />;
  } catch {
    return <p className="whitespace-pre-wrap text-sm text-red-500">解析失敗，原文：{result.slice(0, 500)}</p>;
  }
}

const TYPE_LABEL: Record<string, string> = { flashcards: "閃卡", quiz: "測驗", mindmap: "心智圖" };

export function NoteDetail({ id }: { id: string }) {
  const note = trpc.note.get.useQuery({ id });
  const start = trpc.generation.start.useMutation();
  const [pollId, setPollId] = useState<string | null>(null);
  const [liveType, setLiveType] = useState("flashcards");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [count, setCount] = useState<"less" | "standard" | "more">("standard");
  const [level, setLevel] = useState<"easy" | "medium" | "hard">("medium");
  const [lang, setLang] = useState<"zh-Hant" | "zh-Hans" | "en">("zh-Hant");
  const [focus, setFocus] = useState("");
  const [custom, setCustom] = useState("");
  const poll = trpc.generation.getStatus.useQuery(
    { id: pollId ?? "" },
    { enabled: !!pollId, refetchInterval: (q) => (q.state.data?.status === "done" || q.state.data?.status === "error" ? false : 2000) },
  );

  useEffect(() => {
    // 做完就合併進歷史：refetch 完成後清掉 live 並選中它，歷史只會出現一份。
    // error 留著不清除，讓錯誤訊息一直可見。
    if (poll.data?.status === "done") {
      const doneId = pollId;
      note.refetch().finally(() => {
        setPollId(null);
        if (doneId) setSelectedId(doneId);
      });
    }
  }, [poll.data?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function gen(type: "flashcards" | "quiz" | "mindmap", focusOverride?: string) {
    const n = parseInt(custom, 10);
    const res = await start.mutateAsync({
      noteId: id,
      type,
      count,
      difficulty: level,
      language: lang,
      focus: focusOverride ?? focus,
      ...(Number.isFinite(n) && n >= 1 ? { customCount: Math.min(50, n) } : {}),
    });
    setLiveType(type);
    setPollId(res.id);
  }

  function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
    return (
      <div className="inline-flex overflow-hidden rounded-md border border-line">
        {options.map((o, i) => (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${i > 0 ? "border-l border-line" : ""} ${value === o.v ? "bg-ink text-white" : "bg-card hover:bg-paper"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }

  const chars = note.data?.rawText.length ?? 0;
  const customN = (() => {
    const n = parseInt(custom, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(50, n) : null;
  })();
  const fcPreview = customN ?? flashcardCount(chars, count);
  const quizPreview = customN ?? quizCount(chars, count);
  const levelLabel = level === "easy" ? "簡單" : level === "hard" ? "困難" : "中等";
  const live: Gen | null =
    poll.data && pollId
      ? { id: pollId, type: liveType, status: poll.data.status, result: poll.data.result, error: poll.data.error }
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

      <div className="card flex flex-col gap-4 p-4 md:p-5">
        <h2 className="font-bold">出題設定</h2>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto]">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted">數量</span>
            <Seg value={count} onChange={setCount} options={[{ v: "less", label: "更少" }, { v: "standard", label: "標準" }, { v: "more", label: "更多" }]} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted">難度</span>
            <Seg value={level} onChange={setLevel} options={[{ v: "easy", label: "簡單" }, { v: "medium", label: "中等" }, { v: "hard", label: "困難" }]} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted">語言</span>
            <select value={lang} onChange={(e) => setLang(e.target.value as typeof lang)} className="field !w-auto text-xs">
              <option value="zh-Hant">繁體中文</option>
              <option value="zh-Hans">简体中文</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted">自訂題數（1-50，空=公式算）</span>
            <input value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="空" className="field !w-24 text-xs" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted">主題聚焦（可空：只圍繞這個主題出）</span>
          <textarea value={focus} onChange={(e) => setFocus(e.target.value)} rows={2} placeholder="例如：只考監護與輔助宣告的部分" className="field resize-y text-sm" />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <button onClick={() => gen("flashcards")} disabled={start.isPending || !!busy} className="card group flex items-center gap-4 p-5 text-left transition-shadow hover:shadow-md disabled:opacity-50">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#F4F4F5]"><CardIcon size={20} /></span>
            <span>
              <span className="block font-semibold group-hover:text-accent">生成閃卡</span>
              <span className="block text-xs text-muted">{chars ? `${fcPreview} 張` : "…"} · {levelLabel}{chars ? ` · 依 ${chars.toLocaleString()} 字算` : ""}</span>
            </span>
          </button>
          <button onClick={() => gen("quiz")} disabled={start.isPending || !!busy} className="card group flex items-center gap-4 p-5 text-left transition-shadow hover:shadow-md disabled:opacity-50">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#F4F4F5]"><QuizIcon size={20} /></span>
            <span>
              <span className="block font-semibold group-hover:text-accent">生成測驗</span>
              <span className="block text-xs text-muted">{chars ? `${quizPreview} 題單選` : "…"} · {levelLabel}</span>
            </span>
          </button>
          <button onClick={() => gen("mindmap")} disabled={start.isPending || !!busy} className="card group flex items-center gap-4 p-5 text-left transition-shadow hover:shadow-md disabled:opacity-50">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#F4F4F5]"><SparkIcon size={20} /></span>
            <span>
              <span className="block font-semibold group-hover:text-accent">生成心智圖</span>
              <span className="block text-xs text-muted">互動圖 · {count === "less" ? "精簡" : count === "more" ? "詳盡" : "標準"}</span>
            </span>
          </button>
        </div>
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
          <GenView
            result={live.result}
            type={live.type}
            sources={readSourceMap(poll.data?.options)}
            paras={note.data ? splitParagraphs(note.data.rawText) : []}
            onGenerate={(t, f) => gen(t, f)}
          />
        </div>
      )}

      {note.data && (
        <HistoryArea
          generations={(note.data.generations ?? []).filter((g) => g.status === "done" && g.result)}
          selectedId={selectedId}
          onSelect={setSelectedId}
          paras={splitParagraphs(note.data.rawText)}
          onGenerate={(t, f) => gen(t, f)}
        />
      )}
    </div>
  );
}

function readSourceMap(optionsJson: string | null | undefined): Record<string, string[]> {
  try {
    const o = JSON.parse(optionsJson || "{}") as { sourceMap?: unknown };
    if (o.sourceMap && typeof o.sourceMap === "object") {
      return o.sourceMap as Record<string, string[]>;
    }
  } catch {
    /* 舊資料沒有映射 */
  }
  return {};
}

function countItems(result: string, type: string): number {
  if (type === "mindmap") return countMindmapNodes(result);
  try {
    const arr = JSON.parse(result) as unknown[];
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

function HistoryArea({
  generations,
  selectedId,
  onSelect,
  paras,
  onGenerate,
}: {
  generations: { id: string; type: string; result: string | null; options: string; createdAt: Date }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  paras: { id: string; text: string }[];
  onGenerate: (type: "flashcards" | "quiz", focus: string) => void;
}) {
  if (generations.length === 0) return null;
  const selected = generations.find((g) => g.id === selectedId) ?? generations[0];
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-bold">歷史記錄 <span className="ml-1 text-xs font-normal text-muted">{generations.length} 份</span></h2>
      <div className="card divide-y divide-line overflow-hidden">
        {generations.map((g) => {
          const active = selected.id === g.id;
          return (
            <button
              key={g.id}
              onClick={() => onSelect(g.id)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-paper ${active ? "bg-paper font-semibold" : ""}`}
            >
              <span className="text-muted">{g.type === "flashcards" ? <CardIcon size={16} /> : g.type === "mindmap" ? <SparkIcon size={16} /> : <QuizIcon size={16} />}</span>
              <span>{TYPE_LABEL[g.type] ?? g.type}</span>
              <span className="text-xs text-muted">{g.type === "mindmap" ? `${countItems(g.result!, g.type)} 節點` : `${countItems(g.result!, g.type)} 題`}</span>
              <span className="ml-auto text-xs text-muted">{new Date(g.createdAt).toLocaleString("zh-TW")}</span>
            </button>
          );
        })}
      </div>
      <GenView key={selected.id} result={selected.result!} type={selected.type} sources={readSourceMap(selected.options)} paras={paras} onGenerate={onGenerate} />
    </div>
  );
}
