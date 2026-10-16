import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="card w-full p-8">
        <h1 className="text-lg font-extrabold">目前離線</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          筆記和 AI 都住在你的電腦裡，手機連不上伺服器就沒東西可看。連上網路（同 WiFi 或 Tailscale）後回來。
        </p>
        <Link href="/app/notes" className="btn-primary mt-5 w-full">
          重試
        </Link>
      </div>
    </div>
  );
}
