// 本地時區的日期鍵（純函數，可前後端共用）。
//
// 為什麼需要它：`Date.prototype.toISOString()` 永遠輸出 UTC。
// 用它切日（`toISOString().slice(0, 10)`）在台北時區會把「本地凌晨 0:00–7:59」
// 的資料算到前一天——複習儀表板的每日答對率曲線與連續天數 streak 會整體錯位。
// 這裡一律用本地時區的 getFullYear/getMonth/getDate 組鍵，不做任何 UTC 換算。

/** 本地時區的 YYYY-MM-DD（例：台北 2026-10-23 01:30 → "2026-10-23"）。 */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 本地日曆日加減 n 天（用 setDate，跨月/跨年/日光節約都由平台處理）。 */
export function addLocalDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** 本地時區當天零點（用來從「今天」往回數連續天數）。 */
export function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
