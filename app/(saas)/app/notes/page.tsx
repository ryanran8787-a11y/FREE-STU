"use client";

import Link from "next/link";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

export default function NotesPage() {
  const notes = trpc.note.list.useQuery();
  const create = trpc.note.create.useMutation();
  const [title, setTitle] = useState("");
  const [rawText, setRawText] = useState("");

  async function save() {
    if (!rawText.trim() || create.isPending) return;
    await create.mutateAsync({ title: title.trim() || "未命名筆記", rawText });
    setTitle("");
    setRawText("");
    notes.refetch();
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">筆記</h1>
        <p className="mt-1 text-sm text-muted">貼上課文講義，存成筆記後就能生成閃卡和測驗。</p>
      </div>

      <div className="card flex flex-col gap-3 p-4 md:p-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="標題（可空，例如：生物第三章）"
          className="field"
        />
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={5}
          placeholder="貼上課文、講義文字…"
          className="field resize-y"
        />
        <button onClick={save} disabled={create.isPending || !rawText.trim()} className="btn-primary self-start">
          {create.isPending ? "儲存中…" : "＋ 存成筆記"}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {notes.data?.map((n) => (
          <Link key={n.id} href={`/app/notes/${n.id}`} className="card group p-4 transition-shadow hover:shadow-md">
            <div className="font-bold transition-colors group-hover:text-primary-deep">{n.title}</div>
            <div className="mt-1 text-xs text-muted">
              {new Date(n.createdAt).toLocaleString("zh-TW")} · {n._count.generations} 個生成
            </div>
          </Link>
        ))}
      </div>
      {notes.data?.length === 0 && (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <div className="text-4xl">📚</div>
          <p className="text-sm text-muted">還沒有筆記，上面貼第一份吧。</p>
        </div>
      )}
    </div>
  );
}
