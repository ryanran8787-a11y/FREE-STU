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
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">筆記</h1>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="標題（可空）"
        className="rounded border p-2 text-sm"
      />
      <textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        rows={6}
        placeholder="貼上課文、講義文字…"
        className="rounded border p-2 text-sm"
      />
      <button
        onClick={save}
        disabled={create.isPending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        存成筆記
      </button>
      <div className="flex flex-col gap-2">
        {notes.data?.map((n) => (
          <Link key={n.id} href={`/app/notes/${n.id}`} className="rounded border p-3 hover:bg-gray-50 dark:hover:bg-gray-900">
            <div className="font-bold">{n.title}</div>
            <div className="text-xs text-gray-500">
              {new Date(n.createdAt).toLocaleString("zh-TW")} · {n._count.generations} 個生成
            </div>
          </Link>
        ))}
        {notes.data?.length === 0 && <p className="text-sm text-gray-500">還沒有筆記，上面貼第一份吧。</p>}
      </div>
    </div>
  );
}
