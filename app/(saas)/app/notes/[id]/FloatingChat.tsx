"use client";

import { useState } from "react";
import { MessageCircle, X, Send, ArrowUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ChatBox } from "@/app/(saas)/app/chat/ChatBox";

/** 浮動聊天 widget：右下角 FAB，點開展開對話面板。只在筆記頁顯示。 */
export function FloatingChat({ noteId, paras }: { noteId: string; paras: Map<string, string> }) {
  const [open, setOpen] = useState(false);
  if (!noteId) return null;
  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 z-30 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-sm font-bold">問這份筆記</span>
            <button onClick={() => setOpen(false)} className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-paper hover:text-ink">
              <X size={14} />
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-3">
            <ChatBox noteId={noteId} paras={paras} showSuggestions={false} compact />
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="invert-chip fixed bottom-4 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105"
        title="問這份筆記"
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>
    </>
  );
}
