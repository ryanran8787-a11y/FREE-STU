// 複習卡持久化：排程深模組（A2；T3-2 走四檔 SM-2 增量狀態）。
// 介面只有兩個：recordAttempt（attempt.log 呼叫）與 listDue（review.queue 呼叫）。
// queue.ts 的純函數（scheduleSm2 增量一步 / replaySm2 歷史重播）是排程規則引擎，這裡只管「讀寫 ReviewCard」＋ lazy backfill。
// O(due)：queue 只掃「到期卡」（dueAt 索引），不掃 Attempt 全表；未到期卡靠 recordAttempt 的 upsert 維護。
import { db } from "@/lib/db";
import { ratingOf, replaySm2, scheduleSm2, type AttemptEvent } from "@/server/review/queue";

type Conf = "high" | "med" | "low";
const conf = (c: string): Conf => (c === "high" || c === "low" ? c : "med");

function parseQuestions(result: string | null, kind: string): string[] {
  if (!result) return [];
  try {
    const parsed = JSON.parse(result) as ({ question?: string; front?: string }[]);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((q) => q?.question ?? q?.front ?? "（題目解析失敗）");
  } catch {
    return [];
  }
}

function parseCount(result: string | null): number {
  try {
    const v = JSON.parse(result ?? "[]") as unknown;
    return Array.isArray(v) ? v.length : 0;
  } catch {
    return 0;
  }
}

function parseOneQuestion(result: string | null, qIndex: number): string | null {
  const qs = parseQuestions(result, "");
  if (qIndex < 0 || qIndex >= qs.length) return null;
  return qs[qIndex];
}

function reasonOf(o: {
  events: AttemptEvent[];
  nextDueAt: number;
  lastCorrect: boolean;
  lastConfidence: AttemptEvent["confidence"] | null;
  now: number;
}): { priority: number; reason: string; overdueDays: number } {
  const DAY = 86_400_000;
  const overdueDays = Math.max(0, Math.floor((o.now - o.nextDueAt) / DAY));
  const isNew = o.events.length === 0;
  let weight = 1;
  let reason: string;
  if (isNew) {
    weight = 1.2;
    reason = "還沒練過，先暖身";
  } else if (!o.lastCorrect && o.lastConfidence === "high") {
    weight = 5;
    reason = "很有把握卻答錯，最優先回來";
  } else if (!o.lastCorrect) {
    weight = 3;
    reason = "上次答錯，回來補洞";
  } else if (overdueDays > 0) {
    weight = 2;
    reason = `已逾期 ${overdueDays} 天，該複習了`;
  } else {
    weight = 1;
    reason = "今天到期，維持記憶";
  }
  return { priority: Math.round((overdueDays + 1) * weight * 100) / 100, reason, overdueDays };
}

export type DueCard = {
  noteId: string;
  noteTitle: string;
  genId: string;
  kind: string;
  qIndex: number;
  question: string;
  intervalDays: number;
  nextDueAt: number;
  overdueDays: number;
  streak: number;
  lastCorrect: boolean;
  priority: number;
  reason: string;
};

/**
 * 作答後 upsert 複習卡：一題一行（genId,qIndex）唯一。
 * - qIndex 越界（題目解析失敗/索引不存在）→ quarantine：不建卡，回 false（Attempt 照寫）。
 * - 增量 SM-2：讀卡上 interval/ease/streak/lapses/reviewCount 當 state，
 *   用 ratingOf(correct, confidence) 走 scheduleSm2 一步（冷啟動預設 interval=1/ease=2.5）。
 * - 舊卡（T3-2 遷移前、reviewCount=0 但有歷史作答）首次走增量時，先用 replaySm2 重播歷史再走一步。
 */
export async function recordAttempt(o: {
  genId: string;
  qIndex: number;
  correct: boolean;
  confidence: Conf;
  at?: number;
  /**
   * 當次 attempt.log 剛寫入的 Attempt id。
   * 遷移重播必須排除它：attempt.log 是「先寫 Attempt、再呼叫這裡」，
   * 只用 createdAt < now 擋不住（now 晚幾毫秒），當次會被重播成兩步。
   */
  attemptId?: string;
}): Promise<{ card: boolean }> {
  const gen = await db.generation.findUnique({ where: { id: o.genId } });
  if (!gen || (gen.type !== "quiz" && gen.type !== "flashcards")) return { card: false };
  const question = parseOneQuestion(gen.result, o.qIndex);
  if (question === null) return { card: false }; // quarantine：越界不建卡
  const now = o.at ?? Date.now();
  const rating = ratingOf(o.correct, o.confidence);
  const prev = await db.reviewCard.findUnique({ where: { genId_qIndex: { genId: o.genId, qIndex: o.qIndex } } });
  let state = prev
    ? { intervalDays: prev.intervalDays, ease: prev.ease, streak: prev.streak, lapses: prev.lapses, reviewCount: prev.reviewCount }
    : {};
  // 舊卡遷移：卡上有 reviewCount=0 但 Attempt 有歷史 → 當次作答已由 attempt.log 先寫入，
  // 需把「當次之前」的歷史重播成 state，再走增量一步（避免當次被算兩次）。
  if (prev && prev.reviewCount === 0) {
    const hist = await db.attempt.findMany({
      where: { genId: o.genId, qIndex: o.qIndex },
      orderBy: { createdAt: "asc" },
    });
    const prior: AttemptEvent[] = hist
      .filter((a) => (o.attemptId ? a.id !== o.attemptId : true) && a.createdAt.getTime() < now)
      .map((a) => ({ correct: a.correct, confidence: conf(a.confidence), at: a.createdAt.getTime() }));
    if (prior.length > 0) state = replaySm2(prior) ?? {};
  }
  const s = scheduleSm2(state, rating, now);
  await db.reviewCard.upsert({
    where: { genId_qIndex: { genId: o.genId, qIndex: o.qIndex } },
    create: {
      genId: o.genId,
      noteId: gen.noteId,
      kind: gen.type,
      qIndex: o.qIndex,
      question,
      intervalDays: s.intervalDays,
      ease: s.ease,
      streak: s.streak,
      reviewCount: s.reviewCount,
      dueAt: new Date(s.nextDueAt),
      lapses: s.lapses,
    },
    update: {
      noteId: gen.noteId,
      kind: gen.type,
      question,
      intervalDays: s.intervalDays,
      ease: s.ease,
      streak: s.streak,
      reviewCount: s.reviewCount,
      dueAt: new Date(s.nextDueAt),
      lapses: s.lapses,
    },
  });
  return { card: true };
}

/**
 * 到期佇列：只掃 dueAt <= now 的卡（O(due)）＋最近 100 個 done 生成的「還沒建卡的題」做 lazy backfill。
 * - 孤兒卡（gen 已刪 / qIndex 越界）lazy 清掉，不回。
 * - 回傳形狀與舊 queue 相同（DueItem），前端不用改。
 */
export async function listDue(limit: number, now = Date.now()): Promise<{ items: DueCard[]; total: number }> {
  // 1) lazy backfill：最近 100 個 done 的 quiz/flashcards，有作答歷史或從沒答過的題若還沒卡 → 建卡（due=now 即到期）。
  const gens = await db.generation.findMany({
    where: { type: { in: ["quiz", "flashcards"] }, status: "done", result: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { note: { select: { title: true } } },
  });
  const genIds = gens.map((g) => g.id);
  const existing = genIds.length === 0
    ? []
    : await db.reviewCard.findMany({ where: { genId: { in: genIds } }, select: { genId: true, qIndex: true } });
  const hasCard = new Set(existing.map((c) => `${c.genId}:${c.qIndex}`));
  // backfill 需要各題歷史：一次撈齊這批 gen 的 attempts（O(100 gens)，沿用舊 queue 上限）。
  const attempts = genIds.length === 0
    ? []
    : await db.attempt.findMany({ where: { genId: { in: genIds } }, orderBy: { createdAt: "asc" } });
  const byQ = new Map<string, typeof attempts>();
  for (const a of attempts) {
    const k = `${a.genId}:${a.qIndex}`;
    const arr = byQ.get(k) ?? [];
    arr.push(a);
    byQ.set(k, arr);
  }
  const genById = new Map(gens.map((g) => [g.id, g]));
  const missing: { genId: string; qIndex: number }[] = [];
  for (const g of gens) {
    const n = parseCount(g.result);
    for (let qi = 0; qi < n; qi++) {
      if (!hasCard.has(`${g.id}:${qi}`)) missing.push({ genId: g.id, qIndex: qi });
    }
  }
  for (const m of missing) {
    const g = genById.get(m.genId)!;
    const qs = parseQuestions(g.result, g.type);
    const question = qs[m.qIndex] ?? "（題目解析失敗）";
    const evts: AttemptEvent[] = (byQ.get(`${m.genId}:${m.qIndex}`) ?? []).map((a) => ({
      correct: a.correct,
      confidence: conf(a.confidence),
      at: a.createdAt.getTime(),
    }));
    const s = replaySm2(evts);
    await db.reviewCard.upsert({
      where: { genId_qIndex: { genId: m.genId, qIndex: m.qIndex } },
      create: {
        genId: m.genId, noteId: g.noteId, kind: g.type, qIndex: m.qIndex, question,
        intervalDays: s?.intervalDays ?? 0, ease: s?.ease ?? 2.5, streak: s?.streak ?? 0,
        reviewCount: s?.reviewCount ?? 0, dueAt: new Date(s?.nextDueAt ?? now), lapses: s?.lapses ?? 0,
      },
      update: {
        noteId: g.noteId, kind: g.type, question,
        intervalDays: s?.intervalDays ?? 0, ease: s?.ease ?? 2.5, streak: s?.streak ?? 0,
        reviewCount: s?.reviewCount ?? 0, dueAt: new Date(s?.nextDueAt ?? now), lapses: s?.lapses ?? 0,
      },
    });
  }

  // 2) O(due)：只掃到期卡。
  const dueCards = await db.reviewCard.findMany({
    where: { dueAt: { lte: new Date(now) } },
    orderBy: [{ dueAt: "asc" }],
    take: 500,
  });
  // listDue 第二段要的 gen 若 backfill 沒載到（>100 舊卡），一次批次補齊，避免 loop 內 N+1。
  const missingGenIds = [...new Set(dueCards.map((c) => c.genId))].filter((id) => !genById.has(id));
  if (missingGenIds.length > 0) {
    const extra = await db.generation.findMany({
      where: { id: { in: missingGenIds } },
      include: { note: { select: { title: true } } },
    });
    for (const g of extra) genById.set(g.id, g);
  }
  // 順手清孤兒卡（gen 已刪 → 整批刪；qIndex 越界 → 單張刪），不擋回傳。
  // B1：kind="plan" 的卡 genId=planId（不是 generation），排除在孤兒判定外，另起一批查 plan 存活。
  const aliveGenIds = new Set(genById.keys());
  const quizDue = dueCards.filter((c) => c.kind !== "plan");
  const orphanGenIds = [...new Set(quizDue.map((c) => c.genId))].filter((id) => !aliveGenIds.has(id));
  if (orphanGenIds.length > 0) {
    await db.reviewCard.deleteMany({ where: { genId: { in: orphanGenIds }, kind: { not: "plan" } } });
  }
  // plan 卡：plan 已刪（非經 remove router，如直接刪 DB）的 → 清掉。
  const planIds = [...new Set(dueCards.filter((c) => c.kind === "plan").map((c) => c.genId))];
  let deadPlanIds: string[] = [];
  if (planIds.length > 0) {
    const alivePlans = await db.studyPlan.findMany({ where: { id: { in: planIds } }, select: { id: true } });
    const alivePlanSet = new Set(alivePlans.map((p) => p.id));
    deadPlanIds = planIds.filter((id) => !alivePlanSet.has(id));
    if (deadPlanIds.length > 0) {
      await db.reviewCard.deleteMany({ where: { genId: { in: deadPlanIds }, kind: "plan" } });
    }
  }
  const noteIds = [...new Set(dueCards.map((c) => c.noteId))];
  const notes = noteIds.length === 0
    ? []
    : await db.note.findMany({ where: { id: { in: noteIds } }, select: { id: true, title: true } });
  const titleOf = new Map(notes.map((n) => [n.id, n.title]));
  const out: DueCard[] = [];
  for (const c of dueCards) {
    if (orphanGenIds.includes(c.genId)) continue;
    // B1：plan 卡直接用 question 快照回，不查 generation、不算排程（無 attempt 歷史）。
    // 完成=刪卡（前端打 unpinTask）；reason 固定文案。
    if (c.kind === "plan") {
      if (deadPlanIds.includes(c.genId)) continue;
      const overdueDays = Math.max(0, Math.floor((now - c.dueAt.getTime()) / 86_400_000));
      out.push({
        noteId: c.noteId,
        noteTitle: titleOf.get(c.noteId) ?? c.noteId.slice(-6),
        genId: c.genId,
        kind: "plan",
        qIndex: c.qIndex,
        question: c.question,
        intervalDays: c.intervalDays,
        nextDueAt: c.dueAt.getTime(),
        overdueDays,
        streak: 0,
        lastCorrect: false,
        priority: Math.round((overdueDays + 1) * 2.5 * 100) / 100,
        reason: overdueDays > 0 ? `計畫已逾期 ${overdueDays} 天，該做了` : "今日計畫任務",
      });
      continue;
    }
    const g = genById.get(c.genId) ?? (await db.generation.findUnique({ where: { id: c.genId } }));
    if (!g || (g.type !== "quiz" && g.type !== "flashcards")) {
      await db.reviewCard.delete({ where: { id: c.id } }).catch(() => undefined);
      continue;
    }
    const qs = parseQuestions(g.result, g.type);
    if (c.qIndex < 0 || c.qIndex >= qs.length) {
      await db.reviewCard.delete({ where: { id: c.id } }).catch(() => undefined);
      continue; // quarantine：生成物縮水後越界的卡直接清掉
    }
    const hist = await db.attempt.findMany({
      where: { genId: c.genId, qIndex: c.qIndex },
      orderBy: { createdAt: "asc" },
    });
    const events: AttemptEvent[] = hist.map((a) => ({ correct: a.correct, confidence: conf(a.confidence), at: a.createdAt.getTime() }));
    const last = hist[hist.length - 1];
    const lastCorrect = last?.correct ?? true;
    const lastConfidence = last ? conf(last.confidence) : null;
    const r = reasonOf({
      events, nextDueAt: c.dueAt.getTime(),
      lastCorrect, lastConfidence, now,
    });
    out.push({
      noteId: c.noteId,
      noteTitle: titleOf.get(c.noteId) ?? genById.get(c.genId)?.note.title ?? c.noteId.slice(-6),
      genId: c.genId,
      kind: c.kind,
      qIndex: c.qIndex,
      question: c.question || qs[c.qIndex],
      intervalDays: c.intervalDays,
      nextDueAt: c.dueAt.getTime(),
      overdueDays: r.overdueDays,
      streak: c.streak,
      lastCorrect,
      priority: r.priority,
      reason: r.reason,
    });
  }
  out.sort((a, b) => b.priority - a.priority);
  return { items: out.slice(0, limit), total: out.length };
}
