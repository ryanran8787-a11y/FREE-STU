"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

const PRESETS = [
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { label: "Gemini（OpenAI 相容）", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash" },
  { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { label: "Ollama（本機）", baseUrl: "http://localhost:11434/v1", model: "llama3.1" },
];

export default function SettingsPage() {
  const status = trpc.user.getKeyStatus.useQuery();
  const setKey = trpc.user.setKey.useMutation();
  const [provider, setProvider] = useState("openai");
  const [baseUrl, setBaseUrl] = useState(PRESETS[0].baseUrl);
  const [model, setModel] = useState(PRESETS[0].model);
  const [apiKey, setApiKey] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (status.data?.hasKey) {
      setProvider(status.data.provider);
      setBaseUrl(status.data.baseUrl);
      setModel(status.data.model);
    }
  }, [status.data]);

  function applyPreset(i: number) {
    setProvider(PRESETS[i].label);
    setBaseUrl(PRESETS[i].baseUrl);
    setModel(PRESETS[i].model);
  }

  async function save() {
    setMsg("");
    try {
      await setKey.mutateAsync({ provider, baseUrl, model, apiKey });
      setApiKey("");
      setMsg("已儲存（Key 只存本機資料庫，不會外洩）。");
      status.refetch();
    } catch (e) {
      setMsg(`儲存失敗：${e instanceof Error ? e.message : "未知錯誤"}`);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">設定</h1>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        貼你自己的 API Key，模型費用走你自己的帳號，本站不經手。狀態：
        {status.isLoading ? "讀取中…" : status.data?.hasKey ? `已設定（${status.data.provider} / ${status.data.model}）` : "未設定"}
      </p>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p, i) => (
          <button key={p.label} onClick={() => applyPreset(i)} className="rounded border px-3 py-1 text-sm">
            {p.label}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-sm">
        名稱
        <input value={provider} onChange={(e) => setProvider(e.target.value)} className="rounded border p-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Base URL（OpenAI 相容端點）
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="rounded border p-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Model
        <input value={model} onChange={(e) => setModel(e.target.value)} className="rounded border p-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        API Key
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="留空則只更新端點/模型"
          className="rounded border p-2"
        />
      </label>
      <button onClick={save} disabled={setKey.isPending} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black">
        儲存
      </button>
      {msg && <p className="text-sm">{msg}</p>}
      <p className="text-xs text-gray-500">Ollama 本機模型走 localhost，Key 可隨便填（後端照傳，Ollama 會忽略）。</p>
    </div>
  );
}
