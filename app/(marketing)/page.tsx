import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { CardIcon, ChatIcon, KeyIcon, QuizIcon } from "@/app/icons";

const FEATURES = [
  { icon: <ChatIcon size={22} />, title: "問到懂", desc: "貼上課文直接問，助教引用你的筆記回答，不瞎掰。" },
  { icon: <CardIcon size={22} />, title: "閃卡", desc: "一鍵把筆記變抽認卡，翻卡複習，考前抱佛腳神器。" },
  { icon: <QuizIcon size={22} />, title: "測驗", desc: "自動出單選題，即答即改，還會打分數。" },
  { icon: <KeyIcon size={22} />, title: "BYOK", desc: "模型用你自己的 Key，支援 10 家供應商，站方零成本、你零月費。" },
];

const STEPS = [
  { n: "1", title: "設定 Key", desc: "去設定頁選一家供應商貼上 key，免費的也行。" },
  { n: "2", title: "存筆記", desc: "貼上課文、講義，存成筆記。" },
  { n: "3", title: "開學", desc: "問問題、抽閃卡、做測驗，循環複習。" },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-4">
        <span className="flex items-center gap-1.5 text-base font-bold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-white">
            <GraduationCap size={18} strokeWidth={2} />
          </span>
          NEXT
        </span>
        <div className="flex gap-2">
          <Link href="/app/settings" className="btn-ghost !px-4 !py-1.5 text-sm">
            設定 Key
          </Link>
          <Link href="/app/chat" className="btn-primary !px-4 !py-1.5 text-sm">
            開始用
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center px-6 pb-16">
        <div className="rise mt-12 flex flex-col items-center text-center md:mt-20">
          <p className="rounded-full border border-line bg-paper px-3 py-1 text-xs text-muted">
            免費 · 開源 · 你的 Key 你做主
          </p>
          <h1 className="mt-6 max-w-2xl text-5xl font-extrabold leading-[1.1] tracking-tight md:text-7xl">
            讀書的苦，
            <br />
            AI 幫你吃一半
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted">
            貼上筆記就能問、能測驗、能抽閃卡。不收月費、不賣你的資料，模型費用走你自己的
            Key。
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/app/chat" className="btn-primary px-6 py-2.5 text-sm">
              免費開始
            </Link>
            <Link href="/app/settings" className="btn-ghost px-6 py-2.5 text-sm">
              先設定 Key
            </Link>
          </div>
        </div>

        <div className="mt-16 grid w-full gap-3 md:grid-cols-2">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="card rise p-6" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#F4F4F5] text-ink">
                {f.icon}
              </div>
              <h3 className="mt-3 text-base font-semibold leading-snug">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="card mt-4 w-full p-6 md:p-8">
          <h2 className="text-lg font-bold">三步開學</h2>
          <div className="mt-4 grid gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper text-sm font-bold">
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
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        NEXT · 免費 AI 學習站 · 你的資料只存你的資料庫
      </footer>
    </div>
  );
}
