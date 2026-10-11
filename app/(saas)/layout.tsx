"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { TrpcProvider } from "@/app/TrpcProvider";
import { trpc } from "@/lib/trpc";

const LINKS = [
  { href: "/app/chat", label: "對話" },
  { href: "/app/notes", label: "筆記" },
  { href: "/app/settings", label: "設定" },
];

function KeyDot() {
  const status = trpc.user.getKeyStatus.useQuery();
  const has = status.data?.hasKey;
  return (
    <span
      title={status.isLoading ? "讀取中" : has ? `已設定（${status.data?.provider}）` : "尚未設定 Key"}
      className={`inline-block h-2 w-2 rounded-full ${has ? "bg-primary" : "bg-sun"}`}
    />
  );
}

function Nav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-10 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-1 p-3">
        <Link href="/" className="mr-3 text-sm font-bold tracking-tight">
          ▲ HSHSA
        </Link>
        {LINKS.map((l) => {
          const active = pathname === l.href || pathname.startsWith(l.href + "/");
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                active ? "bg-paper font-semibold text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          <KeyDot />
          Key
        </span>
      </div>
    </nav>
  );
}

export default function SaasLayout({ children }: { children: React.ReactNode }) {
  return (
    <TrpcProvider>
      <Suspense>
        <Nav />
      </Suspense>
      <main className="mx-auto w-full max-w-3xl flex-1 p-4 md:p-6">{children}</main>
    </TrpcProvider>
  );
}
