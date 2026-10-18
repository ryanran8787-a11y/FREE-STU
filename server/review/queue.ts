// 間隔重複佇列：純函數，SM-2 簡化版（無狀態，attempt 歷史即狀態）。
// 輸入：每題的作答序列（舊→新），含對錯 + 信心；輸出：到期佇列（按優先級排序）。
// 規則（簡單可解釋，用戶可在 review 頁看到「為什麼推這題」）：
// - 答對：間隔拉長 1→3→7→16→35→70 天封頂；答錯：間隔歸零（明天就回來）。
// - 高信心答錯：懲罰更重（當天就回來，priority 最高）；低信心答對：間隔只走一半（不自信的對不算熟）。
// - priority 分數 = 逾期天數 × 權重（錯題權重 3、高信心錯 5、新題 1.2），分數越高越先複習。

export type AttemptEvent = {
  correct: boolean;
  confidence: "high" | "med" | "low";
  /** 作答時間戳（ms） */
  at: number;
};

export type QueueItemInput = {
  noteId: string;
  noteTitle: string;
  genId: string;
  kind: string;
  qIndex: number;
  question: string;
  events: AttemptEvent[];
};

export type DueItem = QueueItemInput & {
  intervalDays: number;
  nextDueAt: number;
  overdueDays: number;
  streak: number;
  lastCorrect: boolean;
  priority: number;
  reason: string;
};

const STEPS = [1, 3, 7, 16, 35, 70];
const DAY = 86_400_000;

function stepIndex(streak: number): number {
  return Math.min(Math.max(streak, 0), STEPS.length - 1);
}

/** 根據單題歷史算下次到期（純函數，可單測）。now 預設 Date.now()，測試可注入。 */
export function scheduleOne(events: AttemptEvent[], now = Date.now()): {
  intervalDays: number;
  nextDueAt: number;
  streak: number;
  lastCorrect: boolean;
  lastConfidence: AttemptEvent["confidence"] | null;
} {
  if (events.length === 0) {
    return { intervalDays: 0, nextDueAt: now, streak: 0, lastCorrect: false, lastConfidence: null };
  }
  const last = events[events.length - 1];
  let streak = 0;
  // 連續答對次數（從尾往前數，遇到錯就斷），但低信心答對只算半次（向下取整）
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (!e.correct) break;
    streak += e.confidence === "low" ? 0.5 : 1;
  }
  streak = Math.floor(streak);
  if (!last.correct) {
    // 答錯：高信心當天回來（0.5 天→今天到期），其餘明天
    const intervalDays = last.confidence === "high" ? 0 : 1;
    return {
      intervalDays,
      nextDueAt: last.at + intervalDays * DAY,
      streak: 0,
      lastCorrect: false,
      lastConfidence: last.confidence,
    };
  }
  const intervalDays = STEPS[stepIndex(streak)] ?? 70;
  // 低信心答對：間隔折半（不自信的對不算熟），最少 1 天
  const adjusted = last.confidence === "low" ? Math.max(1, Math.floor(intervalDays / 2)) : intervalDays;
  return {
    intervalDays: adjusted,
    nextDueAt: last.at + adjusted * DAY,
    streak,
    lastCorrect: true,
    lastConfidence: last.confidence,
  };
}

/** 整批算到期佇列：只回「已到期」+「從沒答過」的題，按 priority 降序。 */
export function computeDue(items: QueueItemInput[], now = Date.now()): DueItem[] {
  const out: DueItem[] = [];
  for (const item of items) {
    const s = scheduleOne(item.events, now);
    const overdueDays = Math.max(0, Math.floor((now - s.nextDueAt) / DAY));
    const isNew = item.events.length === 0;
    if (!isNew && s.nextDueAt > now) continue; // 還沒到期
    let weight = 1;
    let reason: string;
    if (isNew) {
      weight = 1.2;
      reason = "還沒練過，先暖身";
    } else if (!s.lastCorrect && s.lastConfidence === "high") {
      weight = 5;
      reason = "很有把握卻答錯，最優先回來";
    } else if (!s.lastCorrect) {
      weight = 3;
      reason = "上次答錯，回來補洞";
    } else if (overdueDays > 0) {
      weight = 2;
      reason = `已逾期 ${overdueDays} 天，該複習了`;
    } else {
      weight = 1;
      reason = "今天到期，維持記憶";
    }
    out.push({
      ...item,
      intervalDays: s.intervalDays,
      nextDueAt: s.nextDueAt,
      overdueDays,
      streak: s.streak,
      lastCorrect: s.lastCorrect,
      priority: Math.round((overdueDays + 1) * weight * 100) / 100,
      reason,
    });
  }
  out.sort((a, b) => b.priority - a.priority);
  return out;
}
