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
      {
        label: "Groq",
        baseUrl: "https://api.groq.com/openai/v1",
        model: "llama-3.3-70b-versatile",
        note: "免費額度大，速度快",
      },
      {
        label: "Cloudflare AI",
        baseUrl: "https://gateway.ai.cloudflare.com/v1/free",
        model: "meta-llama/llama-3.1-8b-instruct",
        note: "Cloudflare 免費額度，註冊即拿 key",
      },
      {
        label: "Mistral",
        baseUrl: "https://api.mistral.ai/v1",
        model: "mistral-small",
        note: "歐盟，免費額度可試",
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
      { label: "MiniMax", baseUrl: "https://api.minimax.chat/v1", model: "MiniMax-M1", note: "中國，長文本強" },
      { label: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen2.5-72B-Instruct", note: "中國，免費額度可試" },
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

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="shrink-0 rounded border border-line px-2 py-0.5 text-xs font-semibold text-muted hover:border-muted hover:text-ink"
    >
      {done ? "已複製" : label}
    </button>
  );
}

/** 手機連線：同 WiFi 直開 / Tailscale（主推）/ Cloudflare Tunnel。PWA 安裝要 HTTPS（Tunnel 或 Tailscale配TLS），純 LAN-IP 只能用主畫面書籤。 */
function PhoneConnect() {
  const lan = trpc.system.lanUrls.useQuery();
  const fwCmd = 'New-NetFirewallRule -DisplayName "FREE-STU" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow';
  return (
    <div className="card flex flex-col gap-3 p-4 md:p-5">
      <h2 className="font-extrabold">手機連線（PWA）</h2>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">1. 同 WiFi 直開（零設定，先驗版面）</span>
        {lan.isLoading ? (
          <p className="text-sm text-muted">讀取本機 IP…</p>
        ) : (lan.data?.urls ?? []).length === 0 ? (
          <p className="text-sm text-muted">抓不到 LAN IP，電腦先連上 WiFi 再重整。</p>
        ) : (
          lan.data!.urls.map((u) => (
            <div key={u} className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{u}</code>
              <CopyBtn text={u} label="複製" />
            </div>
          ))
        )}
        <p className="text-xs leading-relaxed text-muted">手機跟電腦連同一個 WiFi，瀏覽器開上面網址。開的是你電腦的 prod（:3001），不是 dev。手機打不開？往下看防火牆。</p>
      </div>
      <div className="flex flex-col gap-1.5 border-t border-line pt-3">
        <span className="text-sm font-semibold">2. Tailscale（主推，出門也能用）</span>
        <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-muted">
          <li>電腦和手機都裝 Tailscale，登入同一個帳號。</li>
          <li>手機瀏覽器開 <code className="font-mono">http://電腦的-Tailscale-IP:3001/app/notes</code>（IP 去 Tailscale 管理頁看，100 開頭）。</li>
          <li>手機「分享 → 加入主畫面」，就有全螢幕圖示。想要正式可安裝 PWA，電腦再跑 <code className="font-mono">tailscale serve --https=443 http://localhost:3001</code> 配 TLS。</li>
        </ol>
      </div>
      <div className="flex flex-col gap-1.5 border-t border-line pt-3">
        <span className="text-sm font-semibold">3. Cloudflare Tunnel（免裝 App，要 HTTPS 時）</span>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate font-mono text-xs">cloudflared tunnel --url http://localhost:3001</code>
          <CopyBtn text="cloudflared tunnel --url http://localhost:3001" label="複製" />
        </div>
        <p className="text-xs leading-relaxed text-muted">跑起來會給一組 https 網址，任何網路都能開、可安裝 PWA。免費臨時網址重開會變；流量會經過 Cloudflare。</p>
      </div>
      <div className="flex flex-col gap-1.5 border-t border-line pt-3">
        <span className="text-sm font-semibold">連不上？放行 Windows 防火牆（管理員 PowerShell 跑一次）</span>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate font-mono text-xs">{fwCmd}</code>
          <CopyBtn text={fwCmd} label="複製" />
        </div>
      </div>
    </div>
  );
}

const DEFAULT_PRESET = PRESET_GROUPS[0].items[0];

export default function SettingsPage() {
  const status = trpc.user.getKeyStatus.useQuery();
  const usage = trpc.usage.stats.useQuery();
  const vision = trpc.user.getVision.useQuery();
  const system = trpc.user.getSystem.useQuery();
  const setKey = trpc.user.setKey.useMutation();
  const setVision = trpc.user.setVision.useMutation();
  const setSystem = trpc.user.setSystem.useMutation();
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
  const [sysPrompt, setSysPrompt] = useState("");
  const [sysMsg, setSysMsg] = useState("");
  const [backing, setBacking] = useState(false);
  const [backupMsg, setBackupMsg] = useState("");
  // C2 還原：兩段確認（選檔 → 輸入「還原」二字 → 上傳），避免手滑。
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState("");

  async function downloadBackup() {
    if (backing) return;
    setBacking(true);
    setBackupMsg("");
    try {
      const res = await fetch("/api/backup");
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(cd);
      a.href = url;
      a.download = m?.[1] ?? "free-stu-backup.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const mb = (blob.size / 1024 / 1024).toFixed(1);
      setBackupMsg(`已下載（${mb} MB）。`);
    } catch (e) {
      setBackupMsg(`備份失敗：${e instanceof Error ? e.message : "未知錯誤"}`);
    } finally {
      setBacking(false);
    }
  }

  async function uploadRestore() {
    if (restoring || !restoreFile) return;
    if (restoreConfirm.trim() !== "還原") {
      setRestoreMsg("請在確認框輸入「還原」二字才會執行。");
      return;
    }
    setRestoring(true);
    setRestoreMsg("");
    try {
      const form = new FormData();
      form.append("file", restoreFile);
      const res = await fetch("/api/backup", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { error?: string; restoredFiles?: number; podcastCount?: number; autoBackup?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRestoreMsg(`還原完成：${json.restoredFiles} 個檔案、${json.podcastCount} 個音檔。還原前自動留底：${json.autoBackup}。建議重新整理頁面。`);
      setRestoreFile(null);
      setRestoreConfirm("");
    } catch (e) {
      setRestoreMsg(`還原失敗：${e instanceof Error ? e.message : "未知錯誤"}`);
    } finally {
      setRestoring(false);
    }
  }

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

  useEffect(() => {
    if (system.data) setSysPrompt(system.data.prompt);
  }, [system.data]);

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

      <div className={`card flex items-center gap-3 border-l-4 p-4 text-sm ${status.data?.hasKey ? "border-l-primary!" : "border-l-sun!"}`}>
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
                  className={`card p-3 text-left transition-all hover:shadow-md ${selected ? "border-primary! ring-2 ring-primary/20" : ""}`}
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
                className={`rounded border px-3 py-1 text-sm ${vProvider === preset.label ? "border-primary! font-bold" : ""}`}
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

      <div className="card flex flex-col gap-3 p-4 md:p-5">
        <h2 className="font-extrabold">全域系統提示詞（選填，影響所有筆記）</h2>
        <p className="text-sm text-muted">
          幫全站 AI 定一個人格口吻，之後所有新對話、新生成都吃這個；舊的已生成不受影響。自訂模板 / 原文是你自己的地盤，不吃這個。
          狀態：{system.isLoading ? "讀取中…" : system.data?.prompt ? "已設定" : "未設定（預設助教口吻）"}
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "貓娘助教", body: "你是一隻博學的貓娘助教。講解正確嚴謹，但語氣慵懶可愛，句尾偶爾加個「喵」，不會多到干擾閱讀。" },
            { label: "考試教官", body: "你是嚴厲的考試教官。只講考點，不講廢話，答錯觀念直接糾正，語氣簡短有力。" },
            { label: "白話大師", body: "你是白話大師。再難的概念都要講到國中生聽懂，多用生活例子，禁用術語堆砌。" },
          ].map((p) => (
            <button key={p.label} onClick={() => setSysPrompt(p.body)} className="rounded border border-line px-3 py-1 text-sm hover:border-muted">
              {p.label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">系統提示詞（留空儲存 = 清除，回到預設）</span>
          <textarea
            value={sysPrompt}
            onChange={(e) => setSysPrompt(e.target.value)}
            rows={4}
            placeholder="例如：萬物貓娘化——不管講什麼，最後都要用貓來舉例。"
            className="field resize-y"
          />
        </label>
        <button
          onClick={async () => {
            setSysMsg("");
            try {
              const r = await setSystem.mutateAsync({ prompt: sysPrompt });
              setSysMsg(r.configured ? "已設定，全站新對話/生成生效。" : "已清除，回到預設助教口吻。");
              system.refetch();
            } catch (e) {
              setSysMsg(`儲存失敗：${e instanceof Error ? e.message : "未知錯誤"}`);
            }
          }}
          disabled={setSystem.isPending}
          className="btn-primary"
        >
          {setSystem.isPending ? "儲存中…" : "儲存系統提示詞"}
        </button>
        {sysMsg && <p className="text-sm">{sysMsg}</p>}
      </div>

      {/* 全庫備份下載 */}
      <div className="card flex flex-col gap-3 p-4 md:p-5">
        <h2 className="font-extrabold">備份全站資料</h2>
        <p className="text-sm text-muted">
          下載一個 zip，內含資料庫快照（筆記、生成、作答紀錄、API key）與所有播客音檔。
          快照是寫入一致性的（VACUUM INTO），進行中的生成不會出現半套資料。
          換電腦時：解開 zip、把 database.db 放到 prisma/ 下、podcasts/ 放到 data/ 下即可。
        </p>
        <button onClick={downloadBackup} disabled={backing} className="btn-primary self-start">
          {backing ? "打包中…" : "⬇ 下載備份 zip"}
        </button>
        {backupMsg && <p className="text-sm">{backupMsg}</p>}
      </div>

      {/* 從備份還原（C2）：上傳 zip → 輸入「還原」確認 → 伺服器先自動留底再覆寫 */}
      <div className="card flex flex-col gap-3 p-4 md:p-5">
        <h2 className="font-extrabold">從備份還原</h2>
        <p className="text-sm text-muted">
          上傳之前下載的備份 zip。還原會<strong>覆寫目前全部資料</strong>，執行前伺服器會自動把現況留底一份
         （data/backups/pre-restore-*.zip），但還是建議先手動下載一次備份再還原。
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">選擇備份 zip</span>
          <input
            type="file"
            accept=".zip"
            onChange={(e) => {
              setRestoreFile(e.target.files?.[0] ?? null);
              setRestoreMsg("");
            }}
            className="text-sm"
          />
          {restoreFile && <span className="text-xs text-muted">已選：{restoreFile.name}（{(restoreFile.size / 1024 / 1024).toFixed(1)} MB）</span>}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">輸入「還原」二字確認覆寫</span>
          <input
            value={restoreConfirm}
            onChange={(e) => setRestoreConfirm(e.target.value)}
            placeholder="還原"
            className="field max-w-40"
          />
        </label>
        <button
          onClick={uploadRestore}
          disabled={restoring || !restoreFile || restoreConfirm.trim() !== "還原"}
          className="self-start rounded border border-red-400 px-4 py-2 text-sm font-bold text-red-400 disabled:opacity-40"
        >
          {restoring ? "還原中…" : "⚠ 執行還原（覆寫現有資料）"}
        </button>
        {restoreMsg && <p className="text-sm">{restoreMsg}</p>}
      </div>

      <PhoneConnect />
    </div>
  );
}
