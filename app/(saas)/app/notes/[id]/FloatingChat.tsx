"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Sparkles } from "lucide-react";
import { ChatBox } from "@/app/(saas)/app/chat/ChatBox";

const QUICK = ["總結一下我的筆記", "幫我解釋這個概念", "考我一題", "列出 3 個重點"];

/** 浮動聊天 widget：右下角 FAB，點開展開對話面板。只在筆記頁顯示。 */
export function FloatingChat({ noteId, paras, noteTitle }: { noteId: string; paras: Map<string, string>; noteTitle?: string }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc 關閉
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // 點外面關閉（只在桌面）
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // 不關 FAB 自己的點擊
        const fab = document.querySelector("[data-fab]");
        if (fab && fab.contains(e.target as Node)) return;
        setOpen(false);
      }
    };
    const t = setTimeout(() => document.addEventListener("mousedown", onClick), 100);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (!noteId) return null;

  return (
    <>
      {open && (
        <>
          {/* 手機 backdrop */}
          <div className="fixed inset-0 z-20 bg-black/20 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className="fixed bottom-20 right-4 z-30 flex w-[380px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-line bg-card shadow-2xl rise"
            style={{ maxHeight: "min(70vh, 600px)" }}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-bold">問這份筆記</div>
                {noteTitle && <div className="truncate text-[11px] text-muted">{noteTitle}</div>}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-paper hover:text-ink"
                title="關閉（Esc）"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <ChatBox noteId={noteId} paras={paras} showSuggestions compact />
            </div>
          </div>
        </>
      )}
      <button
        data-fab
        onClick={() => setOpen((v) => !v)}
        className="invert-chip fixed bottom-4 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 active:scale-95"
        title={open ? "關閉對話" : "問這份筆記"}
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>
    </>
  );
}
