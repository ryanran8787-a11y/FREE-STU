"use client";

import { trpc } from "@/lib/trpc";

/** 知識衝突偵測：生成時 LLM 標的 ⚠️ 衝突清單，橘色卡顯示，可帶衝突主題重生成。 */
export function ConflictsCard({ genId, conflicts, onRegen }: { genId: string; conflicts: string[]; onRegen: (focus: string) => void }) {
  if (conflicts.length === 0) return null;
  return (
    <div className="card rise border-l-4 !border-l-sun p-4">
      <h2 className="text-sm font-bold">⚠️ 筆記內的衝突 ({conflicts.length})</h2>
      <p className="mt-1 text-xs text-muted">不同段落說法不一致，AI 生成時標出來了。建議回原文確認，或用衝突主題再出一份。</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {conflicts.map((c, i) => (
          <li key={i} className="flex items-start gap-2 rounded-md bg-paper px-3 py-2 text-xs leading-relaxed">
            <span className="mt-0.5 shrink-0 text-sun">⚠</span>
            <span className="flex-1">{c}</span>
            <button onClick={() => onRegen(c.slice(0, 80))} className="shrink-0 font-semibold text-accent hover:underline">
              針對這點重生成
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
