// B1 plan-to-queue：due-date 純函數＋ qIndex 編碼。
// - due 一律「本地 08:00」（零時區地雷：不碰 UTC 換算，Date 本地構造）。
// - day 是 PlanView 的 1-based 天數（d.day）；qIndex = dayIndex(0-based)*100 + taskIndex。
export function planDueAt(dayIndex: number, now = Date.now()): Date {
  const base = new Date(now);
  base.setHours(8, 0, 0, 0);
  base.setDate(base.getDate() + dayIndex);
  return base;
}

export function planQIndex(day: number, taskIndex: number): number {
  return (day - 1) * 100 + taskIndex;
}
