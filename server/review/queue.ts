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

export type Sm2Rating = "again" | "hard" | "good" | "easy";

const STEPS = [1, 3, 7, 16, 35, 70];
const DAY = 86_400_000;

/** DeepTutor practice/scheduler.py 對口狀態（冷啟動預設 interval=1/ease=2.5）。 */
export type Sm2State = {
  intervalDays?: number;
  ease?: number;
  streak?: number;
  lapses?: number;
  reviewCount?: number;
  version?: number;
};

export type Sm2Result = {
  intervalDays: number;
  ease: number;
  streak: number;
  lapses: number;
  nextDueAt: number;
  lastReviewAt: number;
  reviewCount: number;
  version: number;
};

/**
 * T3-1：四檔 SM-2（DeepTutor practice/scheduler.py 60 行照搬，DAY 換算為 ms）。
 * - Again=10分鐘（10/1440 天）、streak 歸零、lapses+1、ease-0.2（下限 1.3）
 * - Hard=×1.2（最少 1 天）、ease-0.15、streak 歸零
 * - Good=3 天起（interval<=1 或無 reviewCount）否則 ×ease；Easy 再 ×1.3、ease+0.15（上限 3.0）
 * - 上限 365 天，interval 取到小數 3 位。
 */
export function scheduleSm2(state: Sm2State, rating: Sm2Rating, now = Date.now()): Sm2Result {
  let interval = typeof state.intervalDays === "number" ? state.intervalDays : 1;
  let ease = typeof state.ease === "number" ? state.ease : 2.5;
  let streak = typeof state.streak === "number" ? state.streak : 0;
  let lapses = typeof state.lapses === "number" ? state.lapses : 0;
  if (rating === "again") {
    interval = 10 / 1440;
    streak = 0;
    lapses += 1;
    ease = Math.max(1.3, ease - 0.2);
  } else if (rating === "hard") {
    interval = Math.max(1.0, interval * 1.2);
    ease = Math.max(1.3, ease - 0.15);
    streak = 0;
  } else if (rating === "good" || rating === "easy") {
    const reviewCount = typeof state.reviewCount === "number" ? state.reviewCount : 0;
    interval = interval <= 1 || !reviewCount ? 3.0 : interval * ease;
    if (rating === "easy") {
      interval *= 1.3;
      ease = Math.min(3.0, ease + 0.15);
    }
    streak += 1;
  } else {
    throw new Error("Unknown review rating");
  }
  interval = Math.min(365.0, Math.round(interval * 1000) / 1000);
  const reviewCount = (typeof state.reviewCount === "number" ? state.reviewCount : 0) + 1;
  const version = (typeof state.version === "number" ? state.version : 0) + 1;
  return {
    intervalDays: interval,
    ease,
    streak,
    lapses,
    nextDueAt: now + interval * DAY,
    lastReviewAt: now,
    reviewCount,
    version,
  };
}

/**
 * confidence→rating 映射（TOP13 設計鎖定）：
 * high+對=Easy / high+錯=Again，med+對=Good / med+錯=Hard，low+對=Hard / low+錯=Again。
 */
export function ratingOf(correct: boolean, confidence: AttemptEvent["confidence"]): Sm2Rating {
  if (!correct) return confidence === "med" ? "hard" : "again";
  if (confidence === "high") return "easy";
  if (confidence === "med") return "good";
  return "hard";
}

/**
 * T3-2：把整段歷史從冷啟動重播成 SM-2 結果（lazy backfill 遷移用；增量路徑不用它）。
 * 每一步用該次作答時間當 now，最終 nextDueAt 落在最後一次作答之後（早該複習的卡自然逾期）。
 * 無歷史回 null（呼叫方建冷卡、即到期）。
 */
export function replaySm2(events: AttemptEvent[]): Sm2Result | null {
  let st: Sm2State = {};
  let out: Sm2Result | null = null;
  for (const e of events) {
    out = scheduleSm2(st, ratingOf(e.correct, e.confidence), e.at);
    st = out;
  }
  return out;
}

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
