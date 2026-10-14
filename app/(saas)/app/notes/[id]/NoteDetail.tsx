"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CardIcon, QuizIcon, SparkIcon } from "@/app/icons";
import { flashcardCount, quizCount } from "@/lib/counts";
import { downloadText, flashcardsToMd, quizToMd, safeName } from "@/lib/export";
import { splitParagraphs } from "@/lib/paras";
import { trpc } from "@/lib/trpc";
import { ChatBox } from "@/app/(saas)/app/chat/ChatBox";
import { MindmapView } from "./MindmapView";

type Gen = { id: string; type: string; status: string; result: string | null; error: string | null };

function Flashcards({ result, title }: { result: string; title: string }) {
  const cards = JSON.parse(result) as { front: string; back: string }[];
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  if (cards.length === 0) return <p className="text-sm text-muted">空的。</p>;
  const c = cards[Math.min(i, cards.length - 1)];
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
    </div>
  );
}

function stripLabel(op: string): string {
  return op.replace(/^[A-D][、．.。:：\s]*/, "");
}

function Quiz({ result, title }: { result: string; title: string }) {
  const qs = JSON.parse(result) as { question: string; options: string[]; answer: number; explanation?: string }[];
  const [picked, setPicked] = useState<Record<number, number>>({});
  const done = Object.keys(picked).length === qs.length;
  const score = qs.filter((q, qi) => picked[qi] === q.answer).length;
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

function GenView({ result, type, sources, paras, title, onGenerate }: { result: string; type: string; sources: Record<string, string[]>; paras: { id: string; text: string }[]; title: string; onGenerate?: (type: "flashcards" | "quiz", focus: string) => void }) {
  if (type === "mindmap") return <MindmapView result={result} sources={sources} paras={paras} onGenerate={onGenerate} title={title} />;
  try {
    const arr = JSON.parse(result) as Record<string, unknown>[];
    if (arr.length > 0 && "options" in arr[0]) return <Quiz result={result} title={title} />;
    return <Flashcards result={result} title={title} />;
  } catch {
    return <p className="whitespace-pre-wrap text-sm text-red-500">解析失敗，原文：{result.slice(0, 500)}</p>;
  }
}

const TYPE_LABEL: Record<string, string> = { flashcards: "閃卡", quiz: "測驗", mindmap: "心智圖" };

type DoneGen = { id: string; type: string; result: string | null; options: string; createdAt: Date };

function SourcesPanel({ title, rawText }: { title: string; rawText: string }) {
  const paras = useMemo(() => splitParagraphs(rawText), [rawText]);
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="card flex max-h-[70vh] flex-col overflow-hidden">
      <div className="border-b border-line p-3">
        <h2 className="text-sm font-bold">來源</h2>
        <p className="mt-0.5 text-xs text-muted">
          {paras.length} 段 · {rawText.length.toLocaleString()} 字
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {paras.map((p) => {
          const open = openId === p.id;
          return (
            <div key={p.id} className="rounded-md">
              <button
                onClick={() => setOpenId(open ? null : p.id)}
                className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-paper ${open ? "bg-paper" : ""}`}
              >
                <span className="mt-0.5 shrink-0 font-mono font-bold text-muted">[{p.id}]</span>
                <span className="leading-relaxed">{open ? p.text : p.text.length > 60 ? p.text.slice(0, 60) + "…" : p.text}</span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="border-t border-line p-3">
        <ExportNoteButton title={title} rawText={rawText} />
      </div>
    </div>
  );
}

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
            className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${i > 0 ? "border-l border-line" : ""} ${value === o.v ? "bg-ink text-white" : "bg-card hover:bg-paper"}`}
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
  const parasList = useMemo(() => (note.data ? splitParagraphs(note.data.rawText) : []), [note.data]);
  const parasMap = useMemo(() => new Map(parasList.map((p) => [p.id.replace(/^p/, ""), p.text])), [parasList]);
  const doneGens = useMemo(
    () => ((note.data?.generations ?? []).filter((g) => g.status === "done" && g.result) as DoneGen[]),
    [note.data],
  );
  const selected = doneGens.find((g) => g.id === selectedId) ?? doneGens[0] ?? null;
  const noteTitle = note.data?.title ?? "未命名筆記";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/app/notes" className="text-muted hover:text-ink">← 筆記</Link>
        <h1 className="truncate text-lg font-extrabold tracking-tight">{note.data?.title ?? "讀取中…"}</h1>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[250px_minmax(0,1fr)_300px]">
        {/* 左：來源 */}
        <div className="order-3 lg:order-1 lg:sticky lg:top-16">
          {note.data ? (
            <SourcesPanel title={note.data.title} rawText={note.data.rawText} />
          ) : (
            <div className="card p-4 text-sm text-muted">讀取中…</div>
          )}
        </div>

        {/* 中：對話 + 結果 */}
        <div className="order-1 flex min-w-0 flex-col gap-4 lg:order-2">
          <div className="card p-4">
            <h2 className="mb-2 text-sm font-bold">問這份筆記</h2>
            <ChatBox noteId={id} paras={parasMap} showSuggestions={false} />
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
                paras={parasList}
                title={noteTitle}
                onGenerate={(t, f) => gen(t, f)}
              />
            </div>
          )}
          {!busy && !(live?.status === "done" && live.result) && selected && (
            <div>
              <h2 className="mb-2 flex items-center gap-1.5 font-bold">
                {selected.type === "flashcards" ? <CardIcon size={16} /> : selected.type === "mindmap" ? <SparkIcon size={16} /> : <QuizIcon size={16} />}
                {TYPE_LABEL[selected.type] ?? selected.type}
              </h2>
              <GenView
                key={selected.id}
                result={selected.result!}
                type={selected.type}
                sources={readSourceMap(selected.options)}
                paras={parasList}
                title={noteTitle}
                onGenerate={(t, f) => gen(t, f)}
              />
            </div>
          )}
          {!busy && !selected && !live && (
            <div className="card flex flex-col items-center gap-2 p-10 text-center text-muted">
              <SparkIcon size={26} />
              <p className="text-sm">還沒生成任何東西，右邊開一發吧。</p>
            </div>
          )}
        </div>

        {/* 右：Studio */}
        <div className="order-2 flex flex-col gap-4 lg:order-3 lg:sticky lg:top-16">
          <div className="card flex flex-col gap-3 p-4">
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
              <button onClick={() => gen("flashcards")} disabled={start.isPending || !!busy} className="btn-ghost w-full !justify-start text-sm disabled:opacity-50">
                <CardIcon size={16} /> 生成閃卡{chars ? `（${fcPreview} 張）` : ""}
              </button>
              <button onClick={() => gen("quiz")} disabled={start.isPending || !!busy} className="btn-ghost w-full !justify-start text-sm disabled:opacity-50">
                <QuizIcon size={16} /> 生成測驗{chars ? `（${quizPreview} 題）` : ""}
              </button>
              <button onClick={() => gen("mindmap")} disabled={start.isPending || !!busy} className="btn-ghost w-full !justify-start text-sm disabled:opacity-50">
                <SparkIcon size={16} /> 生成心智圖（{count === "less" ? "精簡" : count === "more" ? "詳盡" : "標準"}）
              </button>
            </div>
          </div>

          {doneGens.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-bold">歷史記錄 <span className="ml-1 text-xs font-normal text-muted">{doneGens.length} 份</span></h2>
              <div className="card divide-y divide-line overflow-hidden">
                {doneGens.map((g) => {
                  const active = selected?.id === g.id;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelectedId(g.id)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-paper ${active ? "bg-paper font-semibold" : ""}`}
                    >
                      <span className="text-muted">{g.type === "flashcards" ? <CardIcon size={14} /> : g.type === "mindmap" ? <SparkIcon size={14} /> : <QuizIcon size={14} />}</span>
                      <span>{TYPE_LABEL[g.type] ?? g.type}</span>
                      <span className="ml-auto text-muted">{new Date(g.createdAt).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" })}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
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

function ExportNoteButton({ title, rawText }: { title: string; rawText: string }) {
  return (
    <button
      onClick={() => downloadText(`${safeName(title)}-筆記.md`, `# ${title}\n\n${rawText}`)}
      className="rounded border border-line px-2.5 py-1 text-xs font-semibold text-muted hover:border-muted hover:text-ink"
    >
      匯出筆記 MD
    </button>
  );
}
