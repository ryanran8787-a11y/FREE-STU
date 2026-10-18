import { z } from "zod";
import { db } from "@/lib/db";
import { publicProcedure, router } from "@/server/trpc";
import { computeDue, type QueueItemInput } from "@/server/review/queue";

export const reviewRouter = router({
  /** 複習與學習紀錄：每天答對率、信心校準、弱點主題（全 SQL，零 token） */
  summary: publicProcedure.input(z.object({ days: z.number().int().min(7).max(90).default(30) })).query(async ({ input }) => {
    const since = new Date();
    since.setDate(since.getDate() - input.days);
    since.setHours(0, 0, 0, 0);
    const attempts = await db.attempt.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
    });
    // 每天：答對率 + 平均信心（med=0.5, high=1, low=0）+ 作答數
    const byDay = new Map<string, { total: number; correct: number; confSum: number }>();
    for (const a of attempts) {
      const key = a.createdAt.toISOString().slice(0, 10);
      const c = byDay.get(key) ?? { total: 0, correct: 0, confSum: 0 };
      c.total++;
      if (a.correct) c.correct++;
      c.confSum += a.confidence === "high" ? 1 : a.confidence === "low" ? 0 : 0.5;
      byDay.set(key, c);
    }
    const days = [...byDay.entries()]
      .map(([date, c]) => ({
        date,
        total: c.total,
        correct: c.correct,
        accuracy: c.total === 0 ? 0 : Math.round((c.correct / c.total) * 100),
        avgConfidence: c.total === 0 ? 0 : Math.round((c.confSum / c.total) * 100),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 弱點主題：拿生成題目文字的關鍵字（以 noteId 聚合，後端只回 noteId + 錯誤數，前端查標題）
    const wrongByNote = new Map<string, number>();
    for (const a of attempts) {
      if (!a.correct) wrongByNote.set(a.noteId, (wrongByNote.get(a.noteId) ?? 0) + 1);
    }
    const weakNotes = [...wrongByNote.entries()]
      .map(([noteId, wrong]) => ({ noteId, wrong }))
      .sort((a, b) => b.wrong - a.wrong)
      .slice(0, 8);

    // 信心校準：整段期間
    const cal = { high: { t: 0, c: 0 }, med: { t: 0, c: 0 }, low: { t: 0, c: 0 } };
    for (const a of attempts) {
      const k = a.confidence as keyof typeof cal;
      cal[k].t++;
      if (a.correct) cal[k].c++;
    }
    const rate = (x: { t: number; c: number }) => (x.t === 0 ? null : Math.round((x.c / x.t) * 100));
    const calib = { high: rate(cal.high), med: rate(cal.med), low: rate(cal.low) };

    // 總覽
    const total = attempts.length;
    const correct = attempts.filter((a) => a.correct).length;
    const streak = (() => {
      // 連續有作答的天數（到今天或昨天為止）
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let d = new Date(today);
      let n = 0;
      while (true) {
        const key = d.toISOString().slice(0, 10);
        if (byDay.has(key)) {
          n++;
          d.setDate(d.getDate() - 1);
        } else {
          // 允許今天還沒作答
          if (n === 0) {
            d.setDate(d.getDate() - 1);
            if (byDay.has(d.toISOString().slice(0, 10))) {
              n++;
              d.setDate(d.getDate() - 1);
              continue;
            }
          }
          break;
        }
      }
      return n;
    })();

    return {
      days,
      weakNotes,
      calib,
      total,
      correct,
      accuracy: total === 0 ? 0 : Math.round((correct / total) * 100),
      streak,
    };
  }),

  /** 今日複習佇列：quiz + flashcards 的每題作答歷史 → computeDue，無狀態 SM-2 簡化版 */
  queue: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(30) }))
    .query(async ({ input }) => {
      const gens = await db.generation.findMany({
        where: { type: { in: ["quiz", "flashcards"] }, status: "done", result: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { note: { select: { title: true } } },
      });
      if (gens.length === 0) return { items: [], total: 0 };
      const attempts = await db.attempt.findMany({
        where: { genId: { in: gens.map((g) => g.id) } },
        orderBy: { createdAt: "asc" },
      });
      const byQ = new Map<string, typeof attempts>();
      for (const a of attempts) {
        const k = `${a.genId}:${a.qIndex}`;
        const arr = byQ.get(k) ?? [];
        arr.push(a);
        byQ.set(k, arr);
      }
      const items: QueueItemInput[] = [];
      for (const g of gens) {
        let qs: string[] = [];
        try {
          const parsed = JSON.parse(g.result as string) as ({ question?: string; front?: string }[]);
          qs = parsed.map((q) => q.question ?? q.front ?? "（題目解析失敗）");
        } catch {
          continue;
        }
        for (let qi = 0; qi < qs.length; qi++) {
          const evts = (byQ.get(`${g.id}:${qi}`) ?? []).map((a) => ({
            correct: a.correct,
            confidence: (a.confidence === "high" || a.confidence === "low" ? a.confidence : "med") as
              | "high"
              | "med"
              | "low",
            at: a.createdAt.getTime(),
          }));
          items.push({
            noteId: g.noteId,
            noteTitle: g.note.title,
            genId: g.id,
            kind: g.type,
            qIndex: qi,
            question: qs[qi],
            events: evts,
          });
        }
      }
      const due = computeDue(items, Date.now());
      return { items: due.slice(0, input.limit), total: due.length };
    }),
});
