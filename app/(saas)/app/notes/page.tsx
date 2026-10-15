"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { BookIcon, UploadIcon } from "@/app/icons";
import { trpc } from "@/lib/trpc";

function NoteCard({ id, title, createdAt, genCount, checked, onToggle, onDeleted }: {
  id: string;
  title: string;
  createdAt: Date;
  genCount: number;
  checked: boolean;
  onToggle: () => void;
  onDeleted: () => void;
}) {
  const remove = trpc.note.remove.useMutation();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doDelete() {
    setBusy(true);
    try {
      await remove.mutateAsync({ id });
      onDeleted();
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <div className={`card group flex items-start gap-2 p-4 transition-shadow hover:shadow-md ${checked ? "!border-primary" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        title="勾選以合併"
        className="mt-1 h-4 w-4 accent-[#059669]"
      />
      <Link href={`/app/notes/${id}`} className="flex-1">
        <div className="text-sm font-semibold transition-colors group-hover:text-accent">{title}</div>
        <div className="mt-1 text-xs text-muted">
          {new Date(createdAt).toLocaleString("zh-TW")} · {genCount} 個生成
        </div>
      </Link>
      {confirm ? (
        <span className="flex shrink-0 items-center gap-1">
          <button onClick={doDelete} disabled={busy} className="rounded border border-red-400 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 disabled:opacity-50">
            確定刪
          </button>
          <button onClick={() => setConfirm(false)} className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:border-muted">
            取消
          </button>
        </span>
      ) : (
        <button onClick={() => setConfirm(true)} title="刪除筆記（含所有生成）" className="shrink-0 rounded border border-transparent px-2 py-0.5 text-xs text-muted opacity-0 transition-opacity hover:border-red-400 hover:text-red-600 group-hover:opacity-100">
          刪除
        </button>
      )}
    </div>
  );
}

export default function NotesPage() {
  const notes = trpc.note.list.useQuery();
  const create = trpc.note.create.useMutation();
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [uploadMsg, setUploadMsg] = useState("");
  const [merging, setMerging] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
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

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function merge() {
    const ids = [...checked];
    if (ids.length < 2 || merging) return;
    setMerging(true);
    try {
      const full = await utils.note.getMany.fetch({ ids });
      if (full.length < 2) throw new Error("讀不到筆記內容");
      const combined = full
        .map((n) => `【來源：${n.title}】\n\n${n.rawText}`)
        .join("\n\n————\n\n")
        .slice(0, 60000);
      const made = await create.mutateAsync({
        title: `合併-${full.slice(0, 3).map((n) => n.title.slice(0, 8)).join("+")}`,
        rawText: combined,
      });
      window.location.href = `/app/notes/${made.id}`;
    } catch (err) {
      setUploadMsg(`合併失敗：${err instanceof Error ? err.message : "未知錯誤"}`);
    } finally {
      setMerging(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
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

      {checked.size >= 2 && (
        <div className="card rise flex items-center gap-3 border-primary bg-primary-soft p-3 text-sm">
          <span>已選 <b>{checked.size}</b> 份筆記</span>
          <button onClick={merge} disabled={merging} className="btn-primary ml-auto !px-4 !py-1.5 text-xs disabled:opacity-50">
            {merging ? "合併中…" : "合併生成知識地圖"}
          </button>
          <button onClick={() => setChecked(new Set())} className="text-xs text-muted hover:text-ink">
            清除
          </button>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {notes.data?.map((n) => (
          <NoteCard
            key={n.id}
            id={n.id}
            title={n.title}
            createdAt={n.createdAt}
            genCount={n._count.generations}
            checked={checked.has(n.id)}
            onToggle={() => toggle(n.id)}
            onDeleted={() => {
              setChecked((prev) => {
                const next = new Set(prev);
                next.delete(n.id);
                return next;
              });
              notes.refetch();
            }}
          />
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
