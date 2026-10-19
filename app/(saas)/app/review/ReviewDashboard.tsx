"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { next } from "@/lib/answer-session";
import { ReviewAnswerRow } from "./ReviewAnswerRow";
import { EmptyState, LoadingSkeleton } from "../notes/[id]/ResultCard";
import { BookIcon, QuizIcon } from "@/app/icons";

/** 日期 YYYY-MM-DD → 中文短日期 */
function fmtDate(s: string): string {
  const d = new Date(s + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 30 天學習曲線＋今日複習佇列＋弱點主題＋信心校準率。全走 attempt/review，零 token。 */
export function ReviewDashboard() {
  const summary = trpc.review.summary.useQuery({ days: 30 });
  const queue = trpc.review.queue.useQuery({ limit: 20 });
  const notes = trpc.note.list.useQuery();
  // A1 本輪待答：首幀取 queue，之後本地 next() 維護（答對移除、答錯排尾），不跳轉。
  const [session, setSession] = useState<{ genId: string; qIndex: number; kind: string; noteId: string; question: string; reason: string; intervalDays: number }[] | null>(null);
  useEffect(() => {
    if (queue.data && session === null) setSession(queue.data.items);
  }, [queue.data, session]);
  const router = useRouter();
  // A3：弱點一鍵出題 — 直接起一份標準 quiz，帶 genId 跳筆記頁接著 poll。
  const startQuiz = trpc.generation.start.useMutation();
  const [quizzingId, setQuizzingId] = useState<string | null>(null);
  const [quizError, setQuizError] = useState("");
  async function quizWeak(noteId: string) {
    setQuizzingId(noteId);
    setQuizError("");
    try {
      const res = await startQuiz.mutateAsync({ noteId, type: "quiz" });
      router.push(`/app/notes/${noteId}?gen=${res.id}`);
    } catch (e) {
      setQuizError(e instanceof Error ? e.message : "出題失敗");
    } finally {
      setQuizzingId(null);
    }
  }
  if (summary.isLoading) return <LoadingSkeleton lines={4} />;
  const s = summary.data!;
  const dueTotal = queue.data?.total ?? 0;
  if (s.total === 0 && dueTotal === 0) {
    return (
      <EmptyState
        icon={<BookIcon size={28} />}
        text="還沒有作答紀錄。去筆記頁生成測驗或閃卡，答完題目會自動記錄在這裡。"
        action={{ label: "去筆記頁", onClick: () => router.push("/app/notes") }}
      />
    );
  }
  const noteTitle = (id: string) => notes.data?.find((n) => n.id === id)?.title ?? id.slice(-6);
  const maxAcc = Math.max(1, ...s.days.map((d) => d.total));
  return (
    <div className="flex flex-col gap-4">
      {queue.data && queue.data.total > 0 ? (
        <div className="card border-primary bg-primary-soft p-4">
          <h2 className="text-sm font-bold">
            今日複習（{session === null ? queue.data.total : session.length} 題待答）
          </h2>
          {(session === null ? queue.data.items : session).length === 0 ? (
            <p className="mt-2 text-sm font-semibold" role="status">本輪完成！答錯的已排回來練過，剩下的下次到期再見。</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5" role="list">
              {(session === null ? queue.data.items : session).map((d) => (
                <ReviewAnswerRow
                  key={`${d.genId}:${d.qIndex}`}
                  item={d}
                  onAnswered={(r) => setSession((prev) => next(prev ?? queue.data!.items, r))}
                />
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted">點題目直接在這裡作答，答完自動排下一次，不用跳回筆記頁。</p>
        </div>
      ) : (
        s.total > 0 && (
          <EmptyState
            icon={<QuizIcon size={28} />}
            text="今日沒有到期的複習。去筆記頁多做幾題，或明天再回來看。"
            action={{ label: "去筆記頁", onClick: () => router.push("/app/notes") }}
          />
        )
      )}
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
              <li key={w.noteId} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/app/notes/${w.noteId}`} className="min-w-0 flex-1 truncate text-accent hover:underline">
                  {noteTitle(w.noteId)}
                </Link>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted">{w.wrong} 題答錯</span>
                  <button
                    onClick={() => quizWeak(w.noteId)}
                    disabled={quizzingId !== null}
                    className="rounded border border-line px-2 py-0.5 text-xs font-semibold hover:border-primary hover:text-primary-deep disabled:opacity-50"
                    title="針對這份筆記出一份測驗"
                  >
                    {quizzingId === w.noteId ? "出題中…" : "出一份測驗"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {quizError && <p className="mt-2 text-xs text-red-500">{quizError}</p>}
        </div>
      )}
    </div>
  );
}
