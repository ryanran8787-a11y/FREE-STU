"use client";

import { useEffect, useRef } from "react";
import type { Para } from "@/lib/paras";
import type { useMindmapNodes } from "./useMindmapNodes";

type Nodes = ReturnType<typeof useMindmapNodes>;

/** 心智圖選中節點面板：來源段落 + 改名/刪除/已理解 + 焦點重生。純展示，邏輯全在 hook。 */
export function MindmapNodePanel({
  selected,
  paras,
  sources,
  onGenerate,
  onClose,
  nodes,
}: {
  selected: string;
  paras: Para[];
  sources: Record<string, string[]>;
  onGenerate?: (type: "flashcards" | "quiz", focus: string) => void;
  onClose: () => void;
  nodes: Nodes;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const paraById = new Map(paras.map((p) => [p.id, p.text]));
  const refs = sources[selected] ?? [];

  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected]);

  return (
    <div ref={panelRef} className="card rise scroll-mt-24 p-4">
      <div className="flex items-center gap-2">
        {nodes.renaming ? (
          <>
            <input
              value={nodes.newName}
              onChange={(e) => nodes.setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") nodes.doRename();
                if (e.key === "Escape") nodes.setRenaming(false);
              }}
              autoFocus
              className="field w-auto! flex-1 text-sm"
            />
            <button onClick={nodes.doRename} className="rounded border border-line px-2.5 py-1 text-xs font-semibold hover:border-muted">確定</button>
            <button onClick={() => nodes.setRenaming(false)} className="rounded border border-line px-2.5 py-1 text-xs text-muted hover:border-muted">取消</button>
          </>
        ) : (
          <>
            <span className="text-sm font-bold">{selected}</span>
            {refs.length === 0 ? (
              <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-muted">尚未驗證來源</span>
            ) : (
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-deep">
                {refs.length} 段來源
              </span>
            )}
            {nodes.mastered.has(selected) && (
              <span className="invert-chip rounded-full px-2 py-0.5 text-xs font-semibold">✓ 已理解</span>
            )}
            <span className="ml-auto flex items-center gap-1">
              <button onClick={nodes.toggleMastered} title="標記已理解 / 取消" className="rounded border border-line px-2 py-0.5 text-xs font-semibold hover:border-muted">
                {nodes.mastered.has(selected) ? "取消已理解" : "已理解"}
              </button>
              <button
                onClick={nodes.startRename}
                className="rounded border border-line px-2 py-0.5 text-xs font-semibold hover:border-muted"
              >
                改名
              </button>
              {nodes.confirmDelete ? (
                <>
                  <button onClick={nodes.doDelete} className="rounded border border-red-400 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                    確認刪除整支
                  </button>
                  <button onClick={() => nodes.setConfirmDelete(false)} className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:border-muted">
                    取消
                  </button>
                </>
              ) : (
                <button onClick={() => nodes.setConfirmDelete(true)} className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:border-red-400 hover:text-red-600">
                  刪除
                </button>
              )}
              <button onClick={onClose} className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:border-muted">
                關閉
              </button>
            </span>
          </>
        )}
      </div>
      {refs.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {refs.map((id) => (
            <div key={id} className="rounded-md bg-paper px-3 py-2 text-xs leading-relaxed">
              <span className="mr-2 font-mono font-bold text-muted">[{id}]</span>
              {paraById.get(id) ?? "（段落已不存在）"}
            </div>
          ))}
        </div>
      )}
      {nodes.saveMsg && <p className="mt-2 text-xs text-muted">{nodes.saveMsg}</p>}
      {onGenerate && (
        <div className="mt-3 flex gap-2">
          <button onClick={() => onGenerate("flashcards", selected)} className="btn-ghost px-3! py-1.5! text-xs">
            以「{selected.length > 12 ? selected.slice(0, 12) + "…" : selected}」出閃卡
          </button>
          <button onClick={() => onGenerate("quiz", selected)} className="btn-ghost px-3! py-1.5! text-xs">
            出測驗
          </button>
        </div>
      )}
    </div>
  );
}
