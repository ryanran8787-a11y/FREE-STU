"use client";

import { trpc } from "@/lib/trpc";

/** 盲點分析：高信心答錯題＋信心校準率。沒作答紀錄就不顯示。 */
export function BlindSpots({ noteId, onRegen }: { noteId: string; onRegen: (focus: string) => void }) {
  const stats = trpc.attempt.stats.useQuery({ noteId });
  if (!stats.data || stats.data.total === 0) return null;
  const s = stats.data;
  return (
    <div className="card rise border-l-4 !border-l-sun p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        盲點分析
        <span className="text-xs font-normal text-muted">已記錄 {s.total} 次作答</span>
      </h2>
      {s.calib && (
        <div className="mt-2 flex gap-3 text-xs text-muted">
          <span>有把握答對率 <b className="text-ink">{s.calib.high}</b></span>
          <span>不確定答對率 <b className="text-ink">{s.calib.med}</b></span>
          <span>瞎猜答對率 <b className="text-ink">{s.calib.low}</b></span>
        </div>
      )}
      {s.blindSpots.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-muted">沒有高信心錯題。自我感覺跟實力一致，繼續保持。</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-xs font-semibold">高信心答錯（最危險的不知道自己不知道）：</p>
          {s.blindSpots.map((b, i) => (
            <div key={`${b.genId}:${b.qIndex}:${i}`} className="rounded-md bg-paper px-3 py-2 text-xs leading-relaxed">
              <div className="font-bold">{b.question}</div>
              <div className="mt-1 text-muted">
                你選：{b.picked}　正解：<b className="text-ink">{b.answer}</b>
              </div>
              <button onClick={() => onRegen(b.question)} className="mt-1 font-semibold text-accent hover:underline">
                針對這題再出一份測驗
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
