"use client";

import { ReactNode } from "react";

/** 統一空狀態：所有 tab 沒內容時用同一個 */
export function EmptyState({ icon, text, action }: { icon: ReactNode; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-10 text-center text-muted">
      <div className="text-ink/40">{icon}</div>
      <p className="text-sm">{text}</p>
      {action && (
        <button onClick={action.onClick} className="btn-ghost !px-4 !py-1.5 text-xs">
          {action.label}
        </button>
      )}
    </div>
  );
}

/** 統一載入骨架：生成中時顯示 */
export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card flex flex-col gap-3 p-5">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-line" style={{ width: `${85 - i * 15}%` }} />
      ))}
    </div>
  );
}

/** 統一結果外殼：標題 + 內容 + 操作列 */
export function ResultCard({
  title,
  badge,
  actions,
  children,
}: {
  title?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="card flex flex-col gap-3 p-4 md:p-5">
      {(title || actions) && (
        <div className="flex items-center gap-2">
          {title && <h3 className="text-sm font-bold">{title}</h3>}
          {badge}
          {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
