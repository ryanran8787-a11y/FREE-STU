// 出題數量公式：按筆記字數縮放，而非固定數字。
// 前後端共用：前端預覽、後端組 prompt 用同一套，保證所見即所得。

export type CountLevel = "less" | "standard" | "more";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 閃卡：約每 600 字一張（標準），上下封頂 */
export function flashcardCount(chars: number, level: CountLevel): number {
  switch (level) {
    case "less":
      return clamp(chars / 1200, 2, 6);
    case "more":
      return clamp(chars / 300, 5, 20);
    default:
      return clamp(chars / 600, 3, 12);
  }
}

/** 測驗：約每 1000 字一題（標準），上下封頂 */
export function quizCount(chars: number, level: CountLevel): number {
  switch (level) {
    case "less":
      return clamp(chars / 2000, 2, 5);
    case "more":
      return clamp(chars / 500, 5, 15);
    default:
      return clamp(chars / 1000, 3, 10);
  }
}
