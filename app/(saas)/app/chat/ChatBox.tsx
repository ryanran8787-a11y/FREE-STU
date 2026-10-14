"use client";

import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { BagIcon } from "@/app/icons";
import { AiMessage } from "./AiMessage";

type Msg = { role: "user" | "ai"; text: string };

const SUGGESTIONS = ["幫我列出這段的 3 個重點", "用白話解釋一次", "考我一題"];

export function ChatBox({
  noteId,
  paras,
  showSuggestions = true,
  compact = false,
}: {
  noteId?: string;
  paras: Map<string, string>;
  showSuggestions?: boolean;
  compact?: boolean;
}) {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [ctrl, setCtrl] = useState<AbortController | null>(null);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || streaming) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: message }, { role: "ai", text: "" }]);
    setStreaming(true);
    const c = new AbortController();
    setCtrl(c);
    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, noteId: noteId || undefined }),
        signal: c.signal,
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          for (const line of part.split("\n")) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            try {
              const evt = JSON.parse(t.slice(5).trim()) as { delta?: string; error?: string };
              if (evt.error) throw new Error(evt.error);
              if (evt.delta) {
                acc += evt.delta;
                const snapshot = acc;
                setMsgs((m) => {
                  const next = [...m];
                  next[next.length - 1] = { role: "ai", text: snapshot };
                  return next;
                });
              }
            } catch (e) {
              if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
            }
          }
        }
      }
      if (!acc) {
        setMsgs((m) => {
          const next = [...m];
          next[next.length - 1] = { role: "ai", text: "（對方已取消或無回應）" };
          return next;
        });
      }
    } catch (e) {
      const aborted = e instanceof Error && (e.name === "AbortError" || c.signal.aborted);
      setMsgs((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        if (last && last.role === "ai" && !last.text) next.pop();
        else if (last && last.role === "ai") next[next.length - 1] = { ...last, text: last.text + "\n\n（已停止）" };
        else next.push({ role: "ai", text: aborted ? "（已停止）" : `出錯了：${e instanceof Error ? e.message : "未知錯誤"}` });
        return next;
      });
    } finally {
      setStreaming(false);
      setCtrl(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={`flex flex-col gap-4 ${compact ? "min-h-0" : "min-h-56"}`}>
        {msgs.length === 0 && showSuggestions && (
          <div className={`flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted ${compact ? "py-3" : "py-6"}`}>
            {!compact && <BagIcon size={26} />}
            <p className="text-sm">還沒開始聊，試試下面這些：</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="btn-ghost !px-3 !py-1.5 text-xs">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="rise flex justify-end">
              <div className="max-w-[85%] rounded-lg rounded-br-sm bg-ink px-3.5 py-2.5 text-sm leading-relaxed text-white">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} className="rise flex justify-start">
              <AiMessage text={m.text} paras={paras} />
            </div>
          ),
        )}
        {streaming && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
            輸出中…
            <button onClick={() => ctrl?.abort()} className="rounded border border-line px-2 py-0.5 text-xs font-semibold hover:border-muted hover:text-ink">
              停止
            </button>
          </div>
        )}
      </div>
      <div className="sticky bottom-4 flex items-end gap-2 rounded-2xl border border-line bg-card p-2 pl-4 shadow-lg">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="輸入問題，Enter 送出（Shift+Enter 換行）"
          className="max-h-32 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted"
        />
        <button
          onClick={() => send()}
          disabled={streaming || !input.trim()}
          aria-label="送出"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-opacity disabled:opacity-30"
        >
          <ArrowUp size={17} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

// ChatBox：可在任意頁面嵌入的串流對話框（noteId 指定參照筆記時帶引用）