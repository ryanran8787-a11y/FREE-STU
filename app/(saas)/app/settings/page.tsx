"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

type Preset = { label: string; baseUrl: string; model: string; note: string };

const PRESET_GROUPS: { title: string; items: Preset[] }[] = [
  {
    title: "免費開局（無卡可試）",
    items: [
      {
        label: "Gemini",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        model: "gemini-2.5-flash",
        note: "免費額度最慷慨，Google AI Studio 拿 key",
      },
      {
        label: "Zhipu GLM",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        model: "glm-4-flash",
        note: "glm-4-flash 免費，中文不錯",
      },
    ],
  },
  {
    title: "付費（便宜大碗）",
    items: [
      { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", note: "基準線" },
      { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", note: "便宜，中文強" },
      { label: "Moonshot（Kimi）", baseUrl: "https://api.moonshot.ai/v1", model: "kimi-k2", note: "長文本強，中文強" },
      { label: "Qwen（DashScope）", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", note: "阿里，中文強" },
      { label: "xAI（Grok）", baseUrl: "https://api.x.ai/v1", model: "grok-3-mini", note: "快" },
      {
        label: "OpenRouter（轉發）",
        baseUrl: "https://openrouter.ai/api/v1",
        model: "meta-llama/llama-3.3-70b-instruct:free",
        note: "一個 key 玩上百個模型，有免費款（:free 後綴）",
      },
    ],
  },
  {
    title: "本機（僅自架版可用）",
    items: [
      { label: "Ollama", baseUrl: "http://localhost:11434/v1", model: "llama3.1", note: "僅自架版可用：本站後端轉發，打的是伺服器的 localhost。本機跑，Key 隨便填" },
      { label: "LM Studio", baseUrl: "http://localhost:1234/v1", model: "local-model", note: "僅自架版可用。本機跑，模型名看你載了什麼" },
    ],
  },
];

const DEFAULT_PRESET = PRESET_GROUPS[0].items[0];

export default function SettingsPage() {
  const status = trpc.user.getKeyStatus.useQuery();
  const setKey = trpc.user.setKey.useMutation();
  const [provider, setProvider] = useState("openai");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_PRESET.baseUrl);
  const [model, setModel] = useState(DEFAULT_PRESET.model);
  const [apiKey, setApiKey] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (status.data?.hasKey) {
      setProvider(status.data.provider);
      setBaseUrl(status.data.baseUrl);
      setModel(status.data.model);
    }
  }, [status.data]);

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
      {PRESET_GROUPS.map((g) => (
        <div key={g.title} className="flex flex-col gap-2">
          <p className="text-xs font-bold text-gray-500">{g.title}</p>
          <div className="flex flex-wrap gap-2">
            {g.items.map((p) => (
              <button
                key={p.label}
                title={p.note}
                onClick={() => {
                  setProvider(p.label);
                  setBaseUrl(p.baseUrl);
                  setModel(p.model);
                }}
                className="rounded border px-3 py-1 text-sm"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      ))}
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
