"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CardIcon, PodIcon, QuizIcon, SparkIcon } from "@/app/icons";
import { flashcardCount, quizCount } from "@/lib/counts";
import { downloadText, flashcardsToMd, quizToMd, safeName } from "@/lib/export";
import { splitParagraphs } from "@/lib/paras";
import { trpc } from "@/lib/trpc";
import { ChatBox } from "@/app/(saas)/app/chat/ChatBox";
import { MindmapView } from "./MindmapView";
import { PodcastView } from "./PodcastView";
import { CustomView } from "./CustomView";
import { CustomSection } from "./CustomSection";
import { BlindSpots } from "./BlindSpots";
import { ConflictsCard } from "./ConflictsCard";

type Gen = { id: string; type: string; status: string; result: string | null; error: string | null };

function Flashcards({ result, title, genId }: { result: string; title: string; genId: string }) {
  const cards = JSON.parse(result) as { front: string; back: string }[];
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

function stripLabel(op: string): string {
  return op.replace(/^[A-D][、．.。:：\s]*/, "");
}

function Quiz({ result, title, genId }: { result: string; title: string; genId: string }) {
  const qs = JSON.parse(result) as { question: string; options: string[]; answer: number; explanation?: string }[];
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [conf, setConf] = useState<Record<number, "high" | "med" | "low">>({});
  const [explain, setExplain] = useState<Record<number, string>>({});
  const [explainLoading, setExplainLoading] = useState<Set<number>>(new Set());
  const utils = trpc.useUtils();
  const log = trpc.attempt.log.useMutation({ onSuccess: () => utils.attempt.stats.invalidate() });
  const explainMut = trpc.generation.explain.useMutation({
    onSuccess: (data, vars) => {
      setExplain((prev) => ({ ...prev, [vars.qIndex]: data.text }));
      setExplainLoading((s) => {
        const n = new Set(s);
        n.delete(vars.qIndex);
        return n;
      });
    },
    onError: (e, vars) => {
      setExplain((prev) => ({ ...prev, [vars.qIndex]: `解釋失敗：${e.message}` }));
      setExplainLoading((s) => {
        const n = new Set(s);
        n.delete(vars.qIndex);
        return n;
      });
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

function GenView({ result, type, sources, paras, title, genId, masteredInit, onSaved, onGenerate }: { result: string; type: string; sources: Record<string, string[]>; paras: { id: string; text: string }[]; title: string; genId: string; masteredInit: string[]; onSaved: () => void; onGenerate?: (type: "flashcards" | "quiz", focus: string) => void }) {
  if (type === "mindmap") return <MindmapView result={result} sources={sources} paras={paras} onGenerate={onGenerate} title={title} genId={genId} masteredInit={masteredInit} onSaved={onSaved} />;
  if (type === "podcast") return <PodcastView result={result} title={title} genId={genId} />;
  if (type === "custom") return <CustomView result={result} title={title} paras={paras} />;
  try {
    const arr = JSON.parse(result) as Record<string, unknown>[];
    if (arr.length > 0 && "options" in arr[0]) return <Quiz result={result} title={title} genId={genId} />;
    return <Flashcards result={result} title={title} genId={genId} />;
  } catch {
    return <p className="whitespace-pre-wrap text-sm text-red-500">解析失敗，原文：{result.slice(0, 500)}</p>;
  }
}

const TYPE_LABEL: Record<string, string> = { flashcards: "閃卡", quiz: "測驗", mindmap: "心智圖", podcast: "播客", custom: "自訂" };

type DoneGen = { id: string; type: string; result: string | null; options: string; createdAt: Date };

function DeleteNoteButton({ id }: { id: string }) {
  const router = useRouter();
  const remove = trpc.note.remove.useMutation();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function doDelete() {
    setBusy(true);
    setErr("");
    try {
      await remove.mutateAsync({ id });
      router.push("/app/notes");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "刪除失敗");
    } finally {
      setBusy(false);
    }
  }

  if (!confirm) {
    return (
      <button onClick={() => setConfirm(true)} title="刪除這份筆記（含所有生成）" className="ml-auto rounded border border-transparent px-2 py-0.5 text-xs text-muted hover:border-red-400 hover:text-red-600">
        刪除筆記
      </button>
    );
  }
  return (
    <span className="ml-auto flex items-center gap-1 text-xs">
      <span className="text-muted">連同生成一起刪？</span>
      <button onClick={doDelete} disabled={busy} className="rounded border border-red-400 bg-red-50 px-2 py-0.5 font-semibold text-red-600 disabled:opacity-50">
        確定刪
      </button>
      <button onClick={() => setConfirm(false)} className="rounded border border-line px-2 py-0.5 text-muted hover:border-muted">
        取消
      </button>
      {err && <span className="text-red-500">{err}</span>}
    </span>
  );
}

function SourcesPanel({ noteId, title, rawText, onChanged }: { noteId: string; title: string; rawText: string; onChanged: () => void }) {
  const paras = useMemo(() => splitParagraphs(rawText), [rawText]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [srcName, setSrcName] = useState("");
  const [srcText, setSrcText] = useState("");
  const [msg, setMsg] = useState("");
  const appendSource = trpc.note.appendSource.useMutation();
  const links = trpc.link.byPara.useQuery({ noteId, paraId: openId ?? "" }, { enabled: !!openId });

  async function doAppend() {
    if (!srcText.trim() || appendSource.isPending) return;
    setMsg("");
    try {
      await appendSource.mutateAsync({ id: noteId, name: srcName.trim() || "補充來源", text: srcText });
      setSrcName("");
      setSrcText("");
      setAdding(false);
      onChanged();
    } catch (e) {
      setMsg(`追加失敗：${e instanceof Error ? e.message : "未知錯誤"}`);
    }
  }

  return (
    <div className="card flex max-h-[70vh] flex-col overflow-hidden">
      <div className="flex items-center border-b border-line p-3">
        <div>
          <h2 className="text-sm font-bold">來源</h2>
          <p className="mt-0.5 text-xs text-muted">
            {paras.length} 段 · {rawText.length.toLocaleString()} 字
          </p>
        </div>
        <button onClick={() => setAdding((v) => !v)} title="追加文字來源" className="ml-auto rounded border border-line px-2 py-0.5 text-xs font-semibold hover:border-muted">
          ＋ 來源
        </button>
      </div>
      {adding && (
        <div className="flex flex-col gap-2 border-b border-line p-3">
          <input value={srcName} onChange={(e) => setSrcName(e.target.value)} placeholder="來源名稱（可空，如：第3章講義）" className="field text-xs" />
          <textarea value={srcText} onChange={(e) => setSrcText(e.target.value)} rows={4} placeholder="貼上來源文字…" className="field resize-y text-xs" />
          {msg && <p className="text-xs text-red-500">{msg}</p>}
          <div className="flex gap-2">
            <button onClick={doAppend} disabled={appendSource.isPending || !srcText.trim()} className="btn-primary !px-3 !py-1 text-xs disabled:opacity-50">
              {appendSource.isPending ? "追加中…" : "追加進來"}
            </button>
            <button onClick={() => setAdding(false)} className="text-xs text-muted hover:text-ink">
              取消
            </button>
          </div>
        </div>
      )}
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
                {open && (links.data?.length ?? 0) > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 px-2">
                    <span className="text-[10px] font-semibold text-muted">被引用：</span>
                    {links.data!.map((l) => (
                      <span key={l.id} className="rounded bg-paper px-1.5 py-0.5 text-[10px] font-mono text-muted">
                        {l.kind === "chat" ? "對話" : l.kind === "mindmap" ? "心智圖" : l.kind === "podcast" ? "播客" : l.kind === "custom" ? "自訂" : l.kind}
                      </span>
                    ))}
                  </div>
                )}
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
  const [podMode, setPodMode] = useState<"read" | "dialogue">("read");
  const [podPair, setPodPair] = useState<"cn" | "tw">("cn");
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

  async function gen(type: "flashcards" | "quiz" | "mindmap" | "podcast" | "custom", focusOverride?: string, pod?: { mode: "read" | "dialogue"; pair: "cn" | "tw" }) {
    const n = parseInt(custom, 10);
    const res = await start.mutateAsync({
      noteId: id,
      type,
      count,
      difficulty: level,
      language: lang,
      focus: focusOverride ?? focus,
      ...(Number.isFinite(n) && n >= 1 ? { customCount: Math.min(50, n) } : {}),
      ...(type === "podcast" ? { podcastMode: pod?.mode ?? "read", voicePair: pod?.pair ?? "cn" } : {}),
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
            className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${i > 0 ? "border-l border-line" : ""} ${value === o.v ? "invert-chip" : "bg-card hover:bg-paper"}`}
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
        {note.data && <DeleteNoteButton id={note.data.id} />}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        {/* 左：來源 */}
        <div className="order-3 lg:order-1 lg:sticky lg:top-16">
          {note.data ? (
            <SourcesPanel noteId={id} title={note.data.title} rawText={note.data.rawText} onChanged={() => note.refetch()} />
          ) : (
            <div className="card p-4 text-sm text-muted">讀取中…</div>
          )}
        </div>

        {/* 中：結果 + 對話（結果在上，對話在下） */}
        <div className="order-1 flex min-w-0 flex-col gap-4 lg:order-2">
          {busy && (
            <div className="card flex items-center gap-3 p-4 text-sm font-medium">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
              {live?.type === "podcast" ? "播客製作中…（逐段合成，約1-3分鐘，好了自動出現）" : live?.type === "custom" ? "自訂生成中…（好了自動出現）" : "AI 出題中…（好了自動出現）"}
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
                genId={pollId ?? ""}
                masteredInit={readMastered(poll.data?.options)}
                onSaved={() => note.refetch()}
                onGenerate={(t, f) => gen(t, f)}
              />
            </div>
          )}
          {!busy && !(live?.status === "done" && live.result) && selected && (
            <div>
              <h2 className="mb-2 flex items-center gap-1.5 font-bold">
                {selected.type === "flashcards" ? <CardIcon size={16} /> : selected.type === "mindmap" ? <SparkIcon size={16} /> : selected.type === "podcast" ? <PodIcon size={16} /> : selected.type === "custom" ? <SparkIcon size={16} /> : <QuizIcon size={16} />}
                {TYPE_LABEL[selected.type] ?? selected.type}
              </h2>
              <GenView
                key={selected.id}
                result={selected.result!}
                type={selected.type}
                sources={readSourceMap(selected.options)}
                paras={parasList}
                title={noteTitle}
                genId={selected.id}
                masteredInit={readMastered(selected.options)}
                onSaved={() => note.refetch()}
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
          {!busy && <BlindSpots noteId={id} onRegen={(f) => gen("quiz", f)} />}
          {!busy && selected && <ConflictsCard genId={selected.id} conflicts={readConflicts(selected.options)} onRegen={(f) => gen("quiz", f)} />}

          <div className="card p-4">
            <h2 className="mb-2 text-sm font-bold">問這份筆記</h2>
            <ChatBox noteId={id} paras={parasMap} showSuggestions={false} compact />
          </div>
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
                <span className="text-xs font-semibold text-muted">自訂題數（只對閃卡/測驗有效）</span>
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
            <div className="flex flex-col gap-1.5 border-t border-line pt-3">
              <span className="text-xs font-semibold text-muted">播客</span>
              <Seg value={podMode} onChange={setPodMode} options={[{ v: "read", label: "朗讀（免費）" }, { v: "dialogue", label: "對談（花token）" }]} />
              <Seg value={podPair} onChange={setPodPair} options={[{ v: "cn", label: "大陸腔" }, { v: "tw", label: "台灣腔" }]} />
              <button onClick={() => gen("podcast", undefined, { mode: podMode, pair: podPair })} disabled={start.isPending || !!busy} className="btn-ghost w-full !justify-start text-sm disabled:opacity-50">
                <PodIcon size={16} /> 生成播客
              </button>
              <p className="text-[11px] leading-relaxed text-muted">主題聚焦會一起吃：對談圍繞它聊，朗讀只讀相關段落。</p>
            </div>
            {note.data && (
              <CustomSection
                noteId={id}
                focus={focus}
                count={count}
                level={level}
                lang={lang}
                rawText={note.data.rawText}
                busy={!!busy}
                onStart={(gid) => {
                  setLiveType("custom");
                  setPollId(gid);
                }}
              />
            )}
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
                      <span className="text-muted">{g.type === "flashcards" ? <CardIcon size={14} /> : g.type === "mindmap" ? <SparkIcon size={14} /> : g.type === "podcast" ? <PodIcon size={14} /> : g.type === "custom" ? <SparkIcon size={14} /> : <QuizIcon size={14} />}</span>
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

  const readConflicts = (optsJson: string | null | undefined): string[] => {
    try {
      const o = JSON.parse(optsJson || "{}") as { conflicts?: unknown };
      return Array.isArray(o.conflicts) ? (o.conflicts as string[]) : [];
    } catch {
      return [];
    }
  };
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

function readMastered(optionsJson: string | null | undefined): string[] {
  try {
    const o = JSON.parse(optionsJson || "{}") as { mastered?: unknown };
    if (Array.isArray(o.mastered)) return o.mastered.filter((t): t is string => typeof t === "string");
  } catch {
    /* 舊資料沒有 */
  }
  return [];
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
