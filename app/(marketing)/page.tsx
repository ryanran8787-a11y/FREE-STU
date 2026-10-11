import Link from "next/link";

const FEATURES = [
  { icon: "💬", title: "問到懂", desc: "貼上課文直接問，助教引用你的筆記回答，不瞎掰。" },
  { icon: "🃏", title: "閃卡", desc: "一鍵把筆記變抽認卡，翻卡複習，考前抱佛腳神器。" },
  { icon: "📝", title: "測驗", desc: "自動出單選題，即答即改，還會打分數。" },
  { icon: "🔑", title: "BYOK", desc: "模型用你自己的 Key，支援 10 家供應商，站方零成本、你零月費。" },
];

const STEPS = [
  { n: "1", title: "設定 Key", desc: "去設定頁選一家供應商貼上 key，免費的也行。" },
  { n: "2", title: "存筆記", desc: "貼上課文、講義，存成筆記。" },
  { n: "3", title: "開學", desc: "問問題、抽閃卡、做測驗，循環複習。" },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between p-6">
        <span className="text-lg font-extrabold tracking-tight">
          <span className="text-primary">HSHSA</span>
        </span>
        <div className="flex gap-3">
          <Link href="/app/settings" className="btn-ghost !px-4 !py-2 text-sm">
            設定 Key
          </Link>
          <Link href="/app/chat" className="btn-primary !px-4 !py-2 text-sm">
            開始用
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center px-6 pb-16">
        <div className="rise mt-10 flex flex-col items-center text-center md:mt-16">
          <p className="rounded-full border border-line bg-card px-4 py-1 text-xs font-semibold text-muted">
            免費 · 開源 · 你的 Key 你做主
          </p>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
            讀書的苦，
            <br />
            <span className="text-primary">AI 幫你吃一半</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted md:text-lg">
            貼上筆記就能問、能測驗、能抽閃卡。不收月費、不賣你的資料，模型費用走你自己的
            Key。
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/app/chat" className="btn-primary text-base">
              免費開始 →
            </Link>
            <Link href="/app/settings" className="btn-ghost text-base">
              先設定 Key
            </Link>
          </div>
        </div>

        <div className="mt-16 grid w-full gap-4 md:grid-cols-2">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="card rise p-6" style={{ animationDelay: `${i * 70}ms` }}>
              <div className="text-3xl">{f.icon}</div>
              <h3 className="mt-3 text-lg font-bold">{f.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="card mt-8 w-full p-6 md:p-8">
          <h2 className="text-xl font-extrabold">三步開學</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft font-extrabold text-primary-deep">
                  {s.n}
                </span>
                <div>
                  <div className="font-bold">{s.title}</div>
                  <div className="mt-0.5 text-sm text-muted">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        HSHSA · 免費 AI 學習站 · 你的資料只存你的資料庫
      </footer>
    </div>
  );
}
