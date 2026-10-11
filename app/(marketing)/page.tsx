import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold">HSHSA — 免費 AI 學習站</h1>
      <p className="text-lg text-gray-600 dark:text-gray-300">
        貼上筆記就能問、能測驗、能抽閃卡。模型用你自己的 Key，免費用到底。
      </p>
      <div className="flex gap-4">
        <Link
          href="/app/chat"
          className="rounded-full bg-black px-6 py-3 text-white dark:bg-white dark:text-black"
        >
          開始用
        </Link>
        <Link href="/app/settings" className="rounded-full border px-6 py-3">
          設定 Key
        </Link>
      </div>
    </main>
  );
}
