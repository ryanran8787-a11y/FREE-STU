"use client";

import { useMemo, useState } from "react";
import { downloadText, safeName } from "@/lib/export";
import { splitParagraphs } from "@/lib/paras";
import { trpc } from "@/lib/trpc";

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

/** Sources 深模組：段落列表 + 引用標記 + 追加來源 + 匯出，全部收在內部。 */
export function SourcesPanel({ noteId, title, rawText, onChanged }: { noteId: string; title: string; rawText: string; onChanged: () => void }) {
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
