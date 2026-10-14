"use client";

import { useMemo, useRef, useState } from "react";
import { BagIcon } from "@/app/icons";
import { splitParagraphs } from "@/lib/paras";
import { trpc } from "@/lib/trpc";
import { AiMessage } from "./AiMessage";

type Msg = { role: "user" | "ai"; text: string };

const SUGGESTIONS = ["幫我列出這段的 3 個重點", "用白話解釋一次", "考我一題"];

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [noteId, setNoteId] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const keyStatus = trpc.user.getKeyStatus.useQuery();
  const notes = trpc.note.list.useQuery();
  const activeNote = trpc.note.get.useQuery({ id: noteId }, { enabled: !!noteId });
  const paras = useMemo(() => {
    if (!activeNote.data) return new Map<string, string>();
    return new Map(splitParagraphs(activeNote.data.rawText).map((p) => [p.id.replace(/^p/, ""), p.text]));
  }, [activeNote.data]);

  function stop() {
    abortRef.current?.abort();
  }

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || streaming) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: message }, { role: "ai", text: "" }]);
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, noteId: noteId || undefined }),
        signal: ctrl.signal,
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
              const evt = JSON.parse(t.slice(5).trim()) as { delta?: string; error?: string; done?: boolean };
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
      const aborted = e instanceof Error && (e.name === "AbortError" || ctrl.signal.aborted);
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
      abortRef.current = null;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">對話</h1>
        <p className="mt-1 text-sm text-muted">問課業、問概念，助教用繁體中文回答。</p>
      </div>

      {!keyStatus.isLoading && !keyStatus.data?.hasKey && (
        <div className="card rise border-l-2 !border-l-sun p-4 text-sm">
          還沒設定 API Key，先去
          <a href="/app/settings" className="font-semibold text-accent underline">
            設定頁
          </a>
          填一個，免費的 Gemini 就能用。
        </div>
      )}

      <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
        <span className="font-semibold">參照筆記：</span>
        <select value={noteId} onChange={(e) => setNoteId(e.target.value)} className="field !w-auto flex-1 text-xs">
          <option value="">不指定（純聊天）</option>
          {notes.data?.map((n) => (
            <option key={n.id} value={n.id}>{n.title}</option>
          ))}
        </select>
        {noteId && <span className="text-xs text-muted">助教會引用這份筆記回答</span>}
      </div>

      <div className="card flex min-h-72 flex-col gap-4 p-4 md:p-5">
        {msgs.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center text-muted">
            <BagIcon size={28} />
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
            <button onClick={stop} className="rounded border border-line px-2 py-0.5 text-xs font-semibold hover:border-muted hover:text-ink">
              停止
            </button>
          </div>
        )}
      </div>

      <div className="sticky bottom-4 flex gap-2">
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
          className="field resize-none shadow-lg"
        />
        <button
          onClick={() => send()}
          disabled={streaming || !input.trim()}
          className="btn-primary shrink-0 !rounded-2xl"
        >
          送出
        </button>
      </div>
    </div>
  );
}
