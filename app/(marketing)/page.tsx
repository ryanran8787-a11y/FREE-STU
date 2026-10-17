import Link from "next/link";
import { GraduationCap, ArrowRight, Sparkles, Layers, ListChecks, MessageCircle, KeyRound, Zap, Shield, GitFork as GithubIcon } from "lucide-react";
import { ThemeToggle } from "@/app/ThemeToggle";
import { CardIcon, ChatIcon, KeyIcon, QuizIcon } from "@/app/icons";

const FEATURES = [
  { icon: <MessageCircle size={20} />, title: "問到懂", desc: "貼上課文直接問，助教引用你的筆記回答，不瞎掰。答錯還能按「要解釋」，三角度再講一次。", tag: "RAG 引用" },
  { icon: <Layers size={20} />, title: "閃卡", desc: "一鍵把筆記變抽認卡，翻卡複習。答完自評記得/模糊/忘了，系統自動追蹤盲點。", tag: "信心標記" },
  { icon: <ListChecks size={20} />, title: "測驗", desc: "自動出單選題，即答即改，打分數。高信心答錯的題會被標出來，下次優先複習。", tag: "盲點分析" },
  { icon: <Sparkles size={20} />, title: "心智圖", desc: "一鍵生成心智圖，節點點擊看來源段落。可改名、刪節點、標已理解、自測模式。", tag: "來源映射" },
];

const EXTRAS = [
  { icon: <Zap size={18} />, title: "播客", desc: "原文朗讀或雙人對談，Edge 高品質語音，可下載 MP3" },
  { icon: <Shield size={18} />, title: "OCR 掃描", desc: "掃描版 PDF 自動辨識，本地 tesseract 免費鏈或視覺模型高精度" },
  { icon: <KeyRound size={18} />, title: "自訂 Prompt", desc: "三層制：簡易選項 / 範本 / 完整編輯器，六個變數隨你組" },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3">
          <span className="flex items-center gap-2 text-base font-bold tracking-tight">
            <span className="invert-chip flex h-7 w-7 items-center justify-center rounded-md">
              <GraduationCap size={16} strokeWidth={2} />
            </span>
            NEXT
          </span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a
              href="https://github.com/ryanran8787-a11y/FREE-STU"
              target="_blank"
              rel="noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-paper hover:text-ink"
              title="GitHub"
            >
              <GithubIcon size={16} />
            </a>
            <Link href="/app/settings" className="btn-ghost !px-3 !py-1.5 text-sm">
              設定 Key
            </Link>
            <Link href="/app/notes" className="btn-primary !px-4 !py-1.5 text-sm">
              開始用
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 pt-16 pb-12 text-center md:pt-24 md:pb-16">
          <div className="rise inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 text-xs text-muted">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            免費 · 開源 · MIT · 你的 Key 你做主
          </div>
          <h1 className="rise mt-6 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
            讀書的苦，
            <br />
            <span className="text-primary">AI 幫你吃一半</span>
          </h1>
          <p className="rise mt-5 max-w-2xl text-base leading-relaxed text-muted md:text-lg">
            貼上筆記就能問、能測驗、能抽閃卡、能聽播客。不收月費、不賣你的資料，
            模型費用走你自己的 Key，站方零成本。
          </p>
          <div className="rise mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/app/notes" className="btn-primary px-6 py-2.5 text-sm">
              免費開始 <ArrowRight size={16} />
            </Link>
            <Link href="/app/settings" className="btn-ghost px-6 py-2.5 text-sm">
              先設定 Key
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted">
            支援 10 家供應商（Gemini 免費額度最慷慨）· 資料只存你的電腦
          </p>
        </section>

        {/* Product mockup */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-16">
          <div className="card rise overflow-hidden p-1 shadow-lg">
            <div className="flex items-center gap-1.5 border-b border-line bg-paper px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-sun" />
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span className="ml-3 text-xs text-muted">NEXT — 筆記詳情</span>
            </div>
            <div className="bg-card p-4 md:p-6">
              <div className="grid gap-3 md:grid-cols-[200px_1fr]">
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-bold text-muted">來源 · 12 段</div>
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className="rounded-md border border-line bg-paper px-2 py-1.5 text-xs text-muted">
                      <span className="font-mono font-bold">[p{n}]</span> 監護宣告須經法院裁定…
                    </div>
                  ))}
                  <div className="text-xs text-muted">…</div>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex gap-1 border-b border-line">
                    {["筆記", "心智圖", "測驗", "閃卡", "播客"].map((t, i) => (
                      <span key={t} className={`px-3 py-1.5 text-xs font-medium ${i === 2 ? "border-b-2 border-primary text-ink" : "text-muted"}`}>
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="card p-3">
                      <div className="text-xs font-bold">1. 監護宣告的聲請人有哪些？</div>
                      <div className="mt-1.5 flex flex-col gap-1">
                        {["A. 本人、配偶、四親等內親屬", "B. 僅本人", "C. 僅配偶", "D. 任意第三人"].map((o, i) => (
                          <div key={i} className={`rounded border px-2 py-1 text-xs ${i === 0 ? "border-accent bg-accent-soft font-semibold" : "border-line"}`}>
                            {o}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="card p-3">
                      <div className="text-xs font-bold">2. 輔助宣告適用於？</div>
                      <div className="mt-1 text-xs text-muted">意思能力未達完全喪失，但仍需協助之情形</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-6 py-12">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">不只是問答</h2>
            <p className="mt-2 text-sm text-muted">從筆記到複習，一條龍搞定。</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="card rise p-5" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                    {f.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold">{f.title}</h3>
                      <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold text-muted">{f.tag}</span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Extras */}
        <section className="mx-auto w-full max-w-6xl px-6 py-8">
          <div className="grid gap-3 md:grid-cols-3">
            {EXTRAS.map((e) => (
              <div key={e.title} className="card p-4">
                <div className="flex items-center gap-2">
                  <span className="text-primary">{e.icon}</span>
                  <h3 className="text-sm font-bold">{e.title}</h3>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{e.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section className="mx-auto w-full max-w-6xl px-6 py-12">
          <div className="card p-6 md:p-8">
            <h2 className="text-lg font-bold">三步開學</h2>
            <div className="mt-5 grid gap-6 md:grid-cols-3">
              {[
                { n: "1", title: "設定 Key", desc: "去設定頁選一家供應商貼上 key，免費的 Gemini 就能用。" },
                { n: "2", title: "存筆記", desc: "貼上課文講義，或上傳 PDF / Word。" },
                { n: "3", title: "開學", desc: "問問題、抽閃卡、做測驗、聽播客，循環複習。" },
              ].map((s) => (
                <div key={s.n} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                    {s.n}
                  </span>
                  <div>
                    <div className="text-sm font-semibold">{s.title}</div>
                    <div className="mt-0.5 text-sm text-muted">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-6xl px-6 py-12 text-center">
          <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">準備好了嗎？</h2>
          <p className="mt-2 text-sm text-muted">免費、開源、MIT 授權。你的資料只存你的電腦。</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/app/notes" className="btn-primary px-6 py-2.5 text-sm">
              免費開始 <ArrowRight size={16} />
            </Link>
            <a
              href="https://github.com/ryanran8787-a11y/FREE-STU"
              target="_blank"
              rel="noreferrer"
              className="btn-ghost px-6 py-2.5 text-sm"
            >
              <GithubIcon size={16} /> 看原始碼
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        NEXT · 免費 AI 學習站 · MIT License · 你的資料只存你的資料庫
      </footer>
    </div>
  );
}
