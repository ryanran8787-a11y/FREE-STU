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
  const usage = trpc.usage.stats.useQuery();
  const vision = trpc.user.getVision.useQuery();
  const setKey = trpc.user.setKey.useMutation();
  const setVision = trpc.user.setVision.useMutation();
  const [provider, setProvider] = useState("openai");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_PRESET.baseUrl);
  const [model, setModel] = useState(DEFAULT_PRESET.model);
  const [apiKey, setApiKey] = useState("");
  const [msg, setMsg] = useState("");
  const [vProvider, setVProvider] = useState("Gemini");
  const [vBaseUrl, setVBaseUrl] = useState("https://generativelanguage.googleapis.com/v1beta/openai");
  const [vModel, setVModel] = useState("gemini-2.5-flash");
  const [vApiKey, setVApiKey] = useState("");
  const [vMsg, setVMsg] = useState("");

  useEffect(() => {
    if (status.data?.hasKey) {
      setProvider(status.data.provider);
      setBaseUrl(status.data.baseUrl);
      setModel(status.data.model);
    }
  }, [status.data]);

  useEffect(() => {
    if (vision.data?.configured) {
      setVProvider(vision.data.provider || "Gemini");
      setVBaseUrl(vision.data.baseUrl);
      setVModel(vision.data.model);
    }
  }, [vision.data]);

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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
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
        <h2 className="font-extrabold">用量（你自己的 Key 花的）</h2>
        {usage.data ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-paper p-3">
              <div className="text-lg font-bold">{usage.data.todayTokens.toLocaleString()}</div>
              <div className="text-xs text-muted">今日 tokens</div>
            </div>
            <div className="rounded-md bg-paper p-3">
              <div className="text-lg font-bold">{usage.data.totalTokens.toLocaleString()}</div>
              <div className="text-xs text-muted">累計 tokens</div>
            </div>
            <div className="rounded-md bg-paper p-3">
              <div className="text-lg font-bold">{usage.data.calls.reduce((a, c) => a + c.count, 0)}</div>
              <div className="text-xs text-muted">累計呼叫（{usage.data.calls.map((c) => `${c.kind}×${c.count}`).join(" ") || "無"}）</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">讀取中…</p>
        )}
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

      <div className="card flex flex-col gap-3 p-4 md:p-5">
        <h2 className="font-extrabold">視覺模型（選填：掃描 PDF 高精度 OCR 用）</h2>
        <p className="text-sm text-muted">
          有填就用你的視覺模型讀掃描頁（要支援看圖的模型，如 Gemini / GPT-4o），沒填就降級全免費本地鏈。
          狀態：{vision.isLoading ? "讀取中…" : vision.data?.configured ? `已設定（${vision.data.provider} / ${vision.data.model}）` : "未設定（本地鏈）"}
        </p>
        <div className="flex flex-wrap gap-2">
          {["Gemini", "OpenAI", "OpenRouter"].map((name) => {
            const preset = PRESET_GROUPS.flatMap((g) => g.items).find((p) => p.label === name);
            if (!preset) return null;
            return (
              <button
                key={name}
                onClick={() => {
                  setVProvider(preset.label);
                  setVBaseUrl(preset.baseUrl);
                  setVModel(preset.model);
                }}
                className={`rounded border px-3 py-1 text-sm ${vProvider === preset.label ? "!border-primary font-bold" : ""}`}
              >
                {name}
              </button>
            );
          })}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">名稱</span>
          <input value={vProvider} onChange={(e) => setVProvider(e.target.value)} className="field" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Base URL</span>
          <input value={vBaseUrl} onChange={(e) => setVBaseUrl(e.target.value)} className="field font-mono text-xs" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Model</span>
          <input value={vModel} onChange={(e) => setVModel(e.target.value)} className="field font-mono text-xs" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">API Key（留空儲存 = 清除，回到本地鏈）</span>
          <input
            type="password"
            value={vApiKey}
            onChange={(e) => setVApiKey(e.target.value)}
            placeholder="不填就是全免費本地 OCR"
            className="field"
          />
        </label>
        <button
          onClick={async () => {
            setVMsg("");
            try {
              const r = await setVision.mutateAsync({ provider: vProvider, baseUrl: vBaseUrl, model: vModel, apiKey: vApiKey });
              setVApiKey("");
              setVMsg(r.configured ? "已設定視覺模型。" : "已清除，回到本地鏈。");
              vision.refetch();
              status.refetch();
            } catch (e) {
              setVMsg(`儲存失敗：${e instanceof Error ? e.message : "未知錯誤"}`);
            }
          }}
          disabled={setVision.isPending}
          className="btn-primary"
        >
          {setVision.isPending ? "儲存中…" : "儲存視覺模型"}
        </button>
        {vMsg && <p className="text-sm">{vMsg}</p>}
      </div>
    </div>
  );
}
