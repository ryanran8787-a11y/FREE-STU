import { db } from "@/lib/db";

/**
 * 開機 reaper：上一個 server 進程死掉時，inline 執行的任務會卡在中間狀態。
 * - Generation `running`：執行者已死，下次 poll 的 CAS 搶不到 → 重置回 `pending`，
 *   讓下一次 getStatus poll 重新認領執行；同時清掉該 gen 的 UsageLink（重跑會重建，避免殘留重複）。
 * - StudyPlan `pending`：plan 是 fire-and-forget（start 內 `void runPlan`），沒有 poll 認領機制，
 *   卡住的只能標 `error` 請使用者重按。
 * 開機時「全部」這類 row 都是孤兒（舊進程已死），不需要時間閾值。
 */
export async function reapStaleTasks(): Promise<{ generations: number; plans: number }> {
  const stuck = await db.generation.findMany({
    where: { status: "running" },
    select: { id: true },
  });
  let generations = 0;
  if (stuck.length > 0) {
    const ids = stuck.map((g) => g.id);
    await db.usageLink.deleteMany({ where: { genId: { in: ids } } });
    const r = await db.generation.updateMany({
      where: { id: { in: ids }, status: "running" },
      data: { status: "pending", error: null },
    });
    generations = r.count;
  }
  const p = await db.studyPlan.updateMany({
    where: { status: "pending" },
    data: { status: "error", error: "服務重啟中斷了這份計畫，請重新產生" },
  });
  return { generations, plans: p.count };
}
