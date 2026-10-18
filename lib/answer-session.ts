// A1 答題會話：純函數，管「本輪待答順序」，不管 DB、不碰排程。
// next(due, result)：答對→移除；答錯→排到隊尾（本輪稍後再練一次）。
// 排程（interval/dueAt）是 A2 recordAttempt 的事，這裡只動順序。
// 放 lib：前台 ReviewDashboard + 後端共用同一份（app 不能 import @/server/*）。
export type SessionCard = {
  genId: string;
  qIndex: number;
};

export type AnswerResult = {
  genId: string;
  qIndex: number;
  correct: boolean;
};

const key = (c: { genId: string; qIndex: number }) => `${c.genId}:${c.qIndex}`;

export function next<T extends SessionCard>(due: T[], result: AnswerResult): T[] {
  const k = key(result);
  const idx = due.findIndex((c) => key(c) === k);
  if (idx === -1) return due;
  if (result.correct) {
    return [...due.slice(0, idx), ...due.slice(idx + 1)];
  }
  const card = due[idx];
  return [...due.slice(0, idx), ...due.slice(idx + 1), card];
}
