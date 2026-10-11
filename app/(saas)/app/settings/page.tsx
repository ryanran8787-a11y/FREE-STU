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
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">設定</h1>
        <p className="mt-1 text-sm text-muted">貼你自己的 API Key，模型費用走你自己的帳號，本站不經手。</p>
      </div>

      <div className={`card flex items-center gap-3 border-l-4 p-4 text-sm ${status.data?.hasKey ? "!border-l-primary" : "!border-l-sun"}`}>
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${status.data?.hasKey ? "bg-primary" : "bg-sun"}`} />
        {status.isLoading
          ? "讀取中…"
          : status.data?.hasKey
            ? <span>已設定：<b>{status.data.provider}</b> / {status.data.model}，可以直接用了</span>
            : "尚未設定 Key，選一家開始吧（推薦免費的 Gemini）"}
      </div>

      {PRESET_GROUPS.map((g) => (
        <div key={g.title} className="flex flex-col gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{g.title}</p>
          <div className="grid gap-2 md:grid-cols-2">
            {g.items.map((p) => {
              const selected = provider === p.label;
              return (
                <button
                  key={p.label}
                  onClick={() => {
                    setProvider(p.label);
                    setBaseUrl(p.baseUrl);
                    setModel(p.model);
                  }}
                  className={`card p-3 text-left transition-all hover:shadow-md ${selected ? "!border-primary ring-2 ring-primary/20" : ""}`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {selected && <span className="inline-block h-2 w-2 rounded-full bg-primary" />}
                    {p.label}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">{p.note}</div>
                  <div className="mt-1 font-mono text-[11px] text-muted">{p.model}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="card flex flex-col gap-3 p-4 md:p-5">
        <h2 className="font-extrabold">微調</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">名稱</span>
          <input value={provider} onChange={(e) => setProvider(e.target.value)} className="field" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Base URL（OpenAI 相容端點）</span>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="field font-mono text-xs" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Model</span>
          <input value={model} onChange={(e) => setModel(e.target.value)} className="field font-mono text-xs" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">API Key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="留空則只更新端點/模型"
            className="field"
          />
        </label>
        <button onClick={save} disabled={setKey.isPending} className="btn-primary">
          {setKey.isPending ? "儲存中…" : "儲存"}
        </button>
        {msg && <p className="text-sm">{msg}</p>}
      </div>
    </div>
  );
}
