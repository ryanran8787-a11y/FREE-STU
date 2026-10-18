"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CardIcon, PodIcon, QuizIcon, SparkIcon } from "@/app/icons";
import { splitParagraphs } from "@/lib/paras";
import { trpc } from "@/lib/trpc";
import { Flashcards } from "./FlashcardsView";
import { Quiz } from "./QuizView";
import { SourcesPanel } from "./SourcesPanel";
import { StudioPanel } from "./StudioPanel";
import { FloatingChat } from "./FloatingChat";
import { MindmapView } from "./MindmapView";
import { PodcastView } from "./PodcastView";
import { CustomView } from "./CustomView";
import { BlindSpots } from "./BlindSpots";
import { ConflictsCard } from "./ConflictsCard";
import { PlanView } from "./PlanView";
import { EmptyState } from "./ResultCard";
import { TagsEditor } from "./TagsEditor";

type Gen = { id: string; type: string; status: string; result: string | null; error: string | null; options: string; createdAt: Date };

const TABS = [
  { key: "note", label: "筆記", icon: null },
  { key: "mindmap", label: "心智圖", icon: SparkIcon },
  { key: "quiz", label: "測驗", icon: QuizIcon },
  { key: "flashcards", label: "閃卡", icon: CardIcon },
  { key: "podcast", label: "播客", icon: PodIcon },
  { key: "custom", label: "自訂", icon: SparkIcon },
  { key: "plan", label: "計畫", icon: SparkIcon },
] as const;

type TabKey = (typeof TABS)[number]["key"];

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

// ===== Tab 式筆記詳情頁 =====

export function NoteDetail({ id }: { id: string }) {
  const note = trpc.note.get.useQuery({ id });
  const start = trpc.generation.start.useMutation();
  const [pollId, setPollId] = useState<string | null>(null);
  const [liveType, setLiveType] = useState("flashcards");
  const [tab, setTab] = useState<TabKey>("note");
  const [selectedGenId, setSelectedGenId] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [studioOpen, setStudioOpen] = useState(true);

  const poll = trpc.generation.getStatus.useQuery(
    { id: pollId ?? "" },
    { enabled: !!pollId, refetchInterval: (q) => (q.state.data?.status === "done" || q.state.data?.status === "error" ? false : 2000) },
  );

  useEffect(() => {
    if (poll.data?.status === "done") {
      const doneId = pollId;
      note.refetch().finally(() => {
        setPollId(null);
        if (doneId) setSelectedGenId(doneId);
        // 自動切到對應 tab
        const typeMap: Record<string, TabKey> = { flashcards: "flashcards", quiz: "quiz", mindmap: "mindmap", podcast: "podcast", custom: "custom" };
        if (liveType in typeMap) setTab(typeMap[liveType]);
      });
    }
  }, [poll.data?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function gen(args: {
    type: "flashcards" | "quiz" | "mindmap" | "podcast" | "custom";
    count: "less" | "standard" | "more";
    level: "easy" | "medium" | "hard";
    lang: "zh-Hant" | "zh-Hans" | "en";
    focus?: string;
    customCount?: number;
    pod?: { mode: "read" | "dialogue"; pair: "cn" | "tw" };
  }) {
    const res = await start.mutateAsync({
      noteId: id,
      type: args.type,
      count: args.count,
      difficulty: args.level,
      language: args.lang,
      focus: args.focus ?? "",
      ...(args.customCount ? { customCount: args.customCount } : {}),
      ...(args.type === "podcast" ? { podcastMode: args.pod?.mode ?? "read", voicePair: args.pod?.pair ?? "cn" } : {}),
    });
    setLiveType(args.type);
    setPollId(res.id);
  }

  /** 焦點重生縫：沿用標準預設值，給盲點 / 心智圖 / 衝突卡用。 */
  function regen(type: "flashcards" | "quiz", focus: string) {
    return gen({ type, count: "standard", level: "medium", lang: "zh-Hant", focus });
  }
  function regenQuiz(focus: string) {
    return regen("quiz", focus);
  }
  const parasList = useMemo(() => (note.data ? splitParagraphs(note.data.rawText) : []), [note.data]);
  const parasMap = useMemo(() => new Map(parasList.map((p) => [p.id.replace(/^p/, ""), p.text])), [parasList]);

  const doneGens = useMemo(
    () => ((note.data?.generations ?? []).filter((g) => g.status === "done" && g.result) as Gen[]),
    [note.data],
  );

  // 每個 tab 的最新生成
  const latestByType = useMemo(() => {
    const map = new Map<string, Gen>();
    for (const g of doneGens) {
      if (!map.has(g.type)) map.set(g.type, g);
    }
    return map;
  }, [doneGens]);

  const selectedGen = selectedGenId ? doneGens.find((g) => g.id === selectedGenId) ?? null : null;
  const activeGen = selectedGen ?? latestByType.get(tab) ?? null;
  const noteTitle = note.data?.title ?? "未命名筆記";

  const readSourceMap = (optionsJson: string | null | undefined): Record<string, string[]> => {
    try {
      const o = JSON.parse(optionsJson || "{}") as { sourceMap?: unknown };
      if (o.sourceMap && typeof o.sourceMap === "object") return o.sourceMap as Record<string, string[]>;
    } catch { /* 舊資料沒有映射 */ }
    return {};
  };
  const readMastered = (optionsJson: string | null | undefined): string[] => {
    try {
      const o = JSON.parse(optionsJson || "{}") as { mastered?: unknown };
      if (Array.isArray(o.mastered)) return o.mastered.filter((t): t is string => typeof t === "string");
    } catch { /* 舊資料沒有 */ }
    return [];
  };
  const readConflicts = (optionsJson: string | null | undefined): string[] => {
    try {
      const o = JSON.parse(optionsJson || "{}") as { conflicts?: unknown };
      return Array.isArray(o.conflicts) ? (o.conflicts as string[]) : [];
    } catch { return []; }
  };

  const busy = poll.data && pollId && poll.data.status !== "done" && poll.data.status !== "error";

  if (!note.data) {
    return <div className="card p-4 text-sm text-muted">讀取中…</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 標頭 */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/app/notes" className="text-muted hover:text-ink">← 筆記</Link>
        <h1 className="truncate text-lg font-extrabold tracking-tight">{note.data.title}</h1>
        <TagsEditor noteId={note.data.id} tags={note.data.tags} />
        <DeleteNoteButton id={note.data.id} />
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-line overflow-x-auto">
        {TABS.map((t) => {
          const count = null;
          const hasContent = true;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? "border-primary text-ink"
                  : "border-transparent text-muted hover:text-ink"
              } ${!hasContent && t.key !== "note" ? "opacity-40" : ""}`}
            >
              {t.icon && <t.icon size={14} />}
              {t.label}
              {hasContent && t.key !== "note" && (
                <span className="ml-0.5 rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary-deep">
                  {doneGens.filter((g) => g.type === t.key).length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 生成中提示 */}
      {busy && (
        <div className="card flex items-center gap-3 p-4 text-sm font-medium">
          <span className="relative flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-line border-t-ink" />
          </span>
          {liveType === "podcast" ? "播客製作中" : liveType === "custom" ? "自訂生成中" : "AI 出題中"}
          <span className="flex gap-0.5">
            <span className="h-1 w-1 animate-bounce rounded-full bg-muted" style={{ animationDelay: "0ms" }} />
            <span className="h-1 w-1 animate-bounce rounded-full bg-muted" style={{ animationDelay: "150ms" }} />
            <span className="h-1 w-1 animate-bounce rounded-full bg-muted" style={{ animationDelay: "300ms" }} />
          </span>
          <span className="text-xs text-muted">好了自動切到對應 tab</span>
        </div>
      )}
      {poll.data?.status === "error" && (
        <div className="card border-l-4 !border-l-red-400 p-4 text-sm rise">失敗：{poll.data.error}</div>
      )}

      {/* 主內容區：左來源（可折疊）+ 中 tab 內容 + 右 Studio（可折疊） */}
      <div className="grid items-start gap-4 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
        {/* 左：來源（可折疊） */}
        <div className={`order-3 lg:order-1 ${sourcesOpen ? "lg:w-[260px]" : "lg:w-10"}`}>
          <button
            onClick={() => setSourcesOpen((v) => !v)}
            className="mb-2 flex items-center gap-1 text-xs text-muted hover:text-ink"
            title={sourcesOpen ? "收起來源" : "展開來源"}
          >
            {sourcesOpen ? "◀ 來源" : "▶"}
          </button>
          {sourcesOpen && (
            <div className="rise">
              <SourcesPanel noteId={id} title={note.data.title} rawText={note.data.rawText} onChanged={() => note.refetch()} />
            </div>
          )}
        </div>

        {/* 中：Tab 內容 */}
        <div key={tab} className="order-1 min-w-0 lg:order-2 rise">
          {tab === "note" && (
            <div className="flex flex-col gap-4">
              <div className="card p-5">
                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                  {note.data.rawText}
                </div>
              </div>
              {!busy && <BlindSpots noteId={id} onRegen={(f) => regen("quiz", f)} />}
            </div>
          )}

          {tab === "mindmap" && (
            activeGen?.type === "mindmap" && activeGen.result ? (
              <div className="flex flex-col gap-3">
                <GenSelector gens={doneGens.filter((g) => g.type === "mindmap")} selected={selectedGenId} onSelect={setSelectedGenId} latest={latestByType.get("mindmap")?.id ?? null} />
                <MindmapView result={activeGen.result} sources={readSourceMap(activeGen.options)} paras={parasList} onGenerate={regen} title={noteTitle} genId={activeGen.id} masteredInit={readMastered(activeGen.options)} onSaved={() => note.refetch()} />
                <ConflictsCard genId={activeGen.id} conflicts={readConflicts(activeGen.options)} onRegen={regenQuiz} />
              </div>
            ) : (
              <EmptyState icon={<SparkIcon size={28} />} text="還沒生成心智圖，右邊 Studio 開一發。" />
            )
          )}

          {tab === "quiz" && (
            activeGen?.type === "quiz" && activeGen.result ? (
              <div className="flex flex-col gap-3">
                <GenSelector gens={doneGens.filter((g) => g.type === "quiz")} selected={selectedGenId} onSelect={setSelectedGenId} latest={latestByType.get("quiz")?.id ?? null} />
                <Quiz result={activeGen.result} title={noteTitle} genId={activeGen.id} />
                <ConflictsCard genId={activeGen.id} conflicts={readConflicts(activeGen.options)} onRegen={regenQuiz} />
              </div>
            ) : (
              <EmptyState icon={<QuizIcon size={28} />} text="還沒生成測驗，右邊 Studio 開一發。" />
            )
          )}

          {tab === "flashcards" && (
            activeGen?.type === "flashcards" && activeGen.result ? (
              <div className="flex flex-col gap-3">
                <GenSelector gens={doneGens.filter((g) => g.type === "flashcards")} selected={selectedGenId} onSelect={setSelectedGenId} latest={latestByType.get("flashcards")?.id ?? null} />
                <Flashcards result={activeGen.result} title={noteTitle} genId={activeGen.id} />
              </div>
            ) : (
              <EmptyState icon={<CardIcon size={28} />} text="還沒生成閃卡，右邊 Studio 開一發。" />
            )
          )}

          {tab === "podcast" && (
            activeGen?.type === "podcast" && activeGen.result ? (
              <div className="flex flex-col gap-3">
                <GenSelector gens={doneGens.filter((g) => g.type === "podcast")} selected={selectedGenId} onSelect={setSelectedGenId} latest={latestByType.get("podcast")?.id ?? null} />
                <PodcastView result={activeGen.result} title={noteTitle} genId={activeGen.id} />
              </div>
            ) : (
              <EmptyState icon={<PodIcon size={28} />} text="還沒生成播客，右邊 Studio 開一發。" />
            )
          )}

          {tab === "custom" && (
            activeGen?.type === "custom" && activeGen.result ? (
              <div className="flex flex-col gap-3">
                <GenSelector gens={doneGens.filter((g) => g.type === "custom")} selected={selectedGenId} onSelect={setSelectedGenId} latest={latestByType.get("custom")?.id ?? null} />
                <CustomView result={activeGen.result} title={noteTitle} paras={parasList} />
              </div>
            ) : (
              <EmptyState icon={<SparkIcon size={28} />} text="還沒生成自訂內容，右邊 Studio 開一發。" />
            )
          )}

          {tab === "plan" && (
            <PlanView noteId={id} title={noteTitle} />
          )}

          {/* 問這份筆記（永遠顯示在最下） */}
          {/* 浮動聊天（取代原本嵌入的 ChatBox） */}
          <FloatingChat noteId={id} paras={parasMap} noteTitle={noteTitle} />
        </div>

        {/* 右：Studio（可折疊） */}
        <div className={`order-2 lg:order-3 ${studioOpen ? "lg:w-[300px]" : "lg:w-10"}`}>
          <button
            onClick={() => setStudioOpen((v) => !v)}
            className="mb-2 flex items-center gap-1 text-xs text-muted hover:text-ink"
            title={studioOpen ? "收起 Studio" : "展開 Studio"}
          >
            {studioOpen ? "▶ Studio" : "◀"}
          </button>
          {studioOpen && note.data && (
            <div className="rise">
              <StudioPanel
                noteId={id}
                rawText={note.data.rawText}
                chars={note.data.rawText.length}
                busy={!!busy}
                starting={start.isPending}
                onGenerate={gen}
                onCustomStart={(gid) => {
                  setLiveType("custom");
                  setPollId(gid);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== 輔助元件 =====

function GenSelector({ gens, selected, onSelect, latest }: { gens: Gen[]; selected: string | null; onSelect: (id: string) => void; latest: string | null }) {
  if (gens.length <= 1) return null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted">版本：</span>
      <select
        value={selected ?? latest ?? ""}
        onChange={(e) => onSelect(e.target.value)}
        className="field !w-auto text-xs"
      >
        {gens.map((g, i) => (
          <option key={g.id} value={g.id}>
            {new Date(g.createdAt).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })} {i === 0 ? "（最新）" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}