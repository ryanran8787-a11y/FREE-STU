"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

type Msg = { role: "user" | "ai"; text: string };

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const ask = trpc.chat.ask.useMutation();
  const keyStatus = trpc.user.getKeyStatus.useQuery();

  async function send() {
    const message = input.trim();
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
      <h1 className="text-2xl font-bold">對話</h1>
      {keyStatus.data && !keyStatus.data.hasKey && (
        <p className="rounded border border-yellow-500 p-3 text-sm">
          還沒設定 API Key，先去<a href="/app/settings" className="underline">設定頁</a>填，支援
          OpenAI / Gemini / DeepSeek / Ollama（OpenAI 相容端點）。
        </p>
      )}
      <div className="flex min-h-64 flex-col gap-3 rounded border p-4">
        {msgs.length === 0 && <p className="text-gray-500">問點什麼吧，比如貼一段課文再問它。</p>}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "self-end bg-gray-100 dark:bg-gray-800" : "self-start border"}>
            <div className="max-w-full whitespace-pre-wrap rounded p-2 text-sm">{m.text}</div>
          </div>
        ))}
        {ask.isPending && <p className="text-sm text-gray-500">想一下…</p>}
      </div>
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={3}
          placeholder="輸入問題，Enter 送出"
          className="flex-1 rounded border p-2 text-sm"
        />
        <button
          onClick={send}
          disabled={ask.isPending}
          className="rounded bg-black px-4 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          送出
        </button>
      </div>
    </div>
  );
}
