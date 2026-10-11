"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { BookIcon, UploadIcon } from "@/app/icons";
import { trpc } from "@/lib/trpc";

export default function NotesPage() {
  const notes = trpc.note.list.useQuery();
  const create = trpc.note.create.useMutation();
  const [title, setTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [uploadMsg, setUploadMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function save() {
    if (!rawText.trim() || create.isPending) return;
    await create.mutateAsync({ title: title.trim() || "未命名筆記", rawText });
    setTitle("");
    setRawText("");
    notes.refetch();
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadMsg("上傳解析中…");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = (await res.json()) as { id?: string; chars?: number; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error ?? "上傳失敗");
      setUploadMsg(`已存成筆記（${json.chars} 字），跳轉中…`);
      notes.refetch();
      window.location.href = `/app/notes/${json.id}`;
    } catch (err) {
      setUploadMsg(`失敗：${err instanceof Error ? err.message : "未知錯誤"}`);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">筆記</h1>
        <p className="mt-1 text-sm text-muted">貼上課文講義，存成筆記後就能生成閃卡和測驗。</p>
      </div>

      <div className="card flex flex-col gap-3 p-4 md:p-5">
        <div className="flex items-center gap-2">
          <h2 className="font-bold">貼文字</h2>
          <span className="text-xs text-muted">或</span>
          <button onClick={() => fileRef.current?.click()} className="btn-ghost !px-3 !py-1.5 text-xs">
            <UploadIcon size={14} /> 上傳 .txt / .md / .pdf
          </button>
          <input ref={fileRef} type="file" accept=".txt,.md,.markdown,.pdf" onChange={upload} className="hidden" />
        </div>
        {uploadMsg && <p className="text-xs text-muted">{uploadMsg}</p>}
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
            <div className="text-sm font-semibold transition-colors group-hover:text-accent">{n.title}</div>
            <div className="mt-1 text-xs text-muted">
              {new Date(n.createdAt).toLocaleString("zh-TW")} · {n._count.generations} 個生成
            </div>
          </Link>
        ))}
      </div>
      {notes.data?.length === 0 && (
        <div className="card flex flex-col items-center gap-2 p-10 text-center text-muted">
          <BookIcon size={28} />
          <p className="text-sm">還沒有筆記，上面貼第一份吧。</p>
        </div>
      )}
    </div>
  );
}
