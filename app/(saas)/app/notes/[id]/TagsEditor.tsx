"use client";

import { useState } from "react";
import { parseTags } from "@/lib/tokens";
import { trpc } from "@/lib/trpc";

/** 標籤編輯器深模組：顯示＋一行編輯，儲存走 note.setTags，介面只有 { noteId, tags }。 */
export function TagsEditor({ noteId, tags }: { noteId: string; tags: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tags);
  const [busy, setBusy] = useState(false);
  const save = trpc.note.setTags.useMutation({
    onSuccess: () => {
      setEditing(false);
    },
  });
  const list = parseTags(tags);

  async function commit() {
    if (busy) return;
    setBusy(true);
    try {
      await save.mutateAsync({ id: noteId, tags: draft });
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <span className="flex flex-wrap items-center gap-1">
        {list.length > 0 ? (
          list.map((t) => (
            <span key={t} className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary-deep">
              {t}
            </span>
          ))
        ) : (
          <span className="text-[10px] text-muted">無標籤</span>
        )}
        <button
          onClick={() => {
            setDraft(tags);
            setEditing(true);
          }}
          title="編輯標籤"
          className="rounded-full border border-dashed border-line px-2 py-0.5 text-[10px] text-muted hover:border-muted hover:text-ink"
        >
          ＋標籤
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        placeholder="逗號分隔，如：生物,考試"
        autoFocus
        disabled={busy}
        className="field !w-44 !px-2 !py-0.5 text-xs"
      />
      <button onClick={commit} disabled={busy} className="rounded border border-primary px-2 py-0.5 text-[10px] font-semibold text-primary-deep hover:bg-primary hover:text-white disabled:opacity-50">
        {busy ? "…" : "存"}
      </button>
      <button onClick={() => setEditing(false)} className="text-[10px] text-muted hover:text-ink">
        取消
      </button>
      {save.error && <span className="text-[10px] text-red-500">{save.error.message}</span>}
    </span>
  );
}
