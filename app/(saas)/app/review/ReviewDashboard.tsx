"use client";

import { trpc } from "@/lib/trpc";
import Link from "next/link";

/** 日期 YYYY-MM-DD → 中文短日期 */
function fmtDate(s: string): string {
  const d = new Date(s + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 30 天學習曲線＋弱點主題＋信心校準率。全走 attempt.stats/review.summary，零 token。 */
export function ReviewDashboard() {
  const summary = trpc.review.summary.useQuery({ days: 30 });
  const notes = trpc.note.list.useQuery();
  if (summary.isLoading) return <div className="card p-4 text-sm text-muted">讀取中…</div>;
  const s = summary.data!;
  if (s.total === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 p-8 text-center text-muted">
        <p className="text-sm">還沒有作答紀錄。</p>
        <p className="text-xs">去筆記頁生成測驗或閃卡，答完題目會自動記錄在這裡。</p>
      </div>
    );
  }
  const noteTitle = (id: string) => notes.data?.find((n) => n.id === id)?.title ?? id.slice(-6);
  const maxAcc = Math.max(1, ...s.days.map((d) => d.total));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-4">
          <div className="text-xs font-semibold text-muted">30 天作答</div>
          <div className="mt-1 text-2xl font-extrabold">{s.total}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-muted">答對率</div>
          <div className="mt-1 text-2xl font-extrabold">{s.accuracy}%</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-muted">連續作答</div>
          <div className="mt-1 text-2xl font-extrabold">{s.streak} 天</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-muted">信心校準</div>
          <div className="mt-1 text-xs leading-relaxed">
            高 {s.calib.high ?? "—"}% · 中 {s.calib.med ?? "—"}% · 低 {s.calib.low ?? "—"}%
          </div>
        </div>
      </div>
      {s.days.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-bold">每日答對率</h2>
          <div className="mt-3 flex items-end gap-1 overflow-x-auto pb-1">
            {s.days.map((d) => (
              <div key={d.date} className="flex min-w-[22px] flex-col items-center gap-0.5" title={`${d.date}：${d.correct}/${d.total}（${d.accuracy}%）`}>
                <div
                  className="w-full rounded-t bg-primary"
                  style={{ height: `${Math.max(2, Math.round((d.accuracy / 100) * 64))}px` }}
                />
                <div className="text-[9px] text-muted">{fmtDate(d.date)}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">柱高 = 答對率，懸停看細節。作答多的天柱子會更寬（等寬顯示，看數字）。</p>
        </div>
      )}
      {s.weakNotes.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-bold">弱點主題（錯題最多的筆記）</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {s.weakNotes.map((w) => (
              <li key={w.noteId} className="flex items-center justify-between text-sm">
                <Link href={`/app/notes/${w.noteId}`} className="min-w-0 flex-1 truncate text-accent hover:underline">
                  {noteTitle(w.noteId)}
                </Link>
                <span className="shrink-0 text-xs text-muted">{w.wrong} 題答錯</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
