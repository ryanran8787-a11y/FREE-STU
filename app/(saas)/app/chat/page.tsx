"use client";

import { useMemo, useState } from "react";
import { splitParagraphs } from "@/lib/paras";
import { trpc } from "@/lib/trpc";
import { ChatBox } from "./ChatBox";

export default function ChatPage() {
  const [noteId, setNoteId] = useState("");
  const keyStatus = trpc.user.getKeyStatus.useQuery();
  const notes = trpc.note.list.useQuery();
  // 組 paras 只需要 rawText，用 getMany（不含 generations）比 note.get 輕
  const activeNotes = trpc.note.getMany.useQuery({ ids: noteId && noteId !== "*" ? [noteId] : [] }, { enabled: !!noteId && noteId !== "*" });
  const paras = useMemo(() => {
    const raw = activeNotes.data?.[0]?.rawText;
    if (!raw) return new Map<string, string>();
    return new Map(splitParagraphs(raw).map((p) => [p.id.replace(/^p/, ""), p.text]));
  }, [activeNotes.data]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">對話</h1>
        <p className="mt-1 text-sm text-muted">問課業、問概念，助教用繁體中文回答。</p>
      </div>

      {!keyStatus.isLoading && !keyStatus.data?.hasKey && (
        <div className="card rise border-l-2 !border-l-sun p-4 text-sm">
          還沒設定 API Key，先去
          <a href="/app/settings" className="font-semibold text-accent underline">
            設定頁
          </a>
          填一個，免費的 Gemini 就能用。
        </div>
      )}

      <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
        <span className="font-semibold">參照筆記：</span>
        <select value={noteId} onChange={(e) => setNoteId(e.target.value)} className="field !w-auto flex-1 text-xs">
          <option value="">不指定（純聊天）</option>
          <option value="*">全部筆記（跨筆記檢索）</option>
          {notes.data?.map((n) => (
            <option key={n.id} value={n.id}>{n.title}</option>
          ))}
        </select>
        {noteId === "*" && <span className="text-xs text-muted">自動從所有筆記找相關段落</span>}
        {noteId && noteId !== "*" && <span className="text-xs text-muted">助教會引用這份筆記回答</span>}
      </div>

      <div className="card p-4 md:p-5">
        <ChatBox noteId={noteId || undefined} paras={paras} />
      </div>

      <p className="text-center text-xs text-muted">AI 可能會出錯，重要內容請核對原文。</p>
    </div>
  );
}
