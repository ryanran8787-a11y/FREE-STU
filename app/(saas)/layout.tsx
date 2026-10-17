"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { ThemeToggle } from "@/app/ThemeToggle";
import { trpc } from "@/lib/trpc";
import { TrpcProvider } from "@/app/TrpcProvider";
import { BookOpen, GraduationCap, MessageCircle, PanelLeft, PanelLeftClose, Settings } from "lucide-react";

const LINKS = [
  { href: "/app/chat", label: "對話", icon: MessageCircle },
  { href: "/app/notes", label: "筆記", icon: BookOpen },
  { href: "/app/review", label: "複習", icon: null },
  { href: "/app/settings", label: "設定", icon: Settings },
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

function NavInner() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside
      className={`fixed left-0 top-0 z-20 flex h-screen flex-col border-r border-line bg-card transition-all duration-200 ${
        collapsed ? "w-14" : "w-52"
      }`}
    >
      {/* Logo + collapse toggle */}
      <div className={`flex h-12 items-center border-b border-line px-3 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed && (
          <Link href="/" className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
            <span className="invert-chip flex h-6 w-6 items-center justify-center rounded-md">
              <GraduationCap size={14} strokeWidth={2} />
            </span>
            NEXT
          </Link>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "展開側邊欄" : "收起側邊欄"}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-paper hover:text-ink"
        >
          {collapsed ? <PanelLeft size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col gap-0.5">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            const Icon = l.icon;
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  title={collapsed ? l.label : undefined}
                  className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
                    active ? "bg-primary-soft font-semibold text-primary-deep" : "text-muted hover:bg-paper hover:text-ink"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  {Icon && <Icon size={16} />}
                  {!collapsed && <span>{l.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom: theme + key status */}
      <div className={`flex items-center border-t border-line p-2 ${collapsed ? "flex-col gap-2" : "justify-between"}`}>
        <ThemeToggle />
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <KeyDot />
          {!collapsed && "Key"}
        </span>
      </div>
    </aside>
  );
}

export default function SaasLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <TrpcProvider>
      <div className="flex min-h-screen">
        <Suspense>
          <NavInner />
        </Suspense>
        <main className={`flex-1 transition-all duration-200 ${collapsed ? "ml-14" : "ml-52"} p-4 md:px-6 md:py-6`}>
          {children}
        </main>
      </div>
    </TrpcProvider>
  );
}
