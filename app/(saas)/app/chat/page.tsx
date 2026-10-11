"use client";

import { useState } from "react";
import { BagIcon } from "@/app/icons";
import { trpc } from "@/lib/trpc";

type Msg = { role: "user" | "ai"; text: string };

const SUGGESTIONS = ["幫我列出這段的 3 個重點", "用白話解釋一次", "考我一題"];

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const ask = trpc.chat.ask.useMutation();
  const keyStatus = trpc.user.getKeyStatus.useQuery();

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || ask.isPending) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: message }]);
    try {
      const res = await ask.mutateAsync({ message });
      setMsgs((m) => [...m, { role: "ai", text: res.reply }]);
    } catch (e) {
      setMsgs((m) => [
        ...m,
        { role: "ai", text: `出錯了：${e instanceof Error ? e.message : "未知錯誤"}` },
      ]);
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
              <div className="max-w-[90%] whitespace-pre-wrap rounded-lg rounded-bl-sm border border-line bg-paper px-3.5 py-2.5 text-sm leading-relaxed">
                {m.text}
              </div>
            </div>
          ),
        )}
        {ask.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
            助教想一下…
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
          disabled={ask.isPending || !input.trim()}
          className="btn-primary shrink-0 !rounded-2xl"
        >
          送出
        </button>
      </div>
    </div>
  );
}
