import { z } from "zod";
import { db } from "@/lib/db";
import { publicProcedure, router } from "@/server/trpc";
import { recordAttempt } from "@/server/review/cards";

const confidence = z.enum(["high", "med", "low"]);

type QuizItem = { question: string; options: string[]; answer: number };
type CardItem = { front: string; back: string };

/** 同一題只留最新一次（重考、重翻會覆蓋） */
async function latestByQ(noteId: string) {
  const rows = await db.attempt.findMany({
    where: { noteId },
    orderBy: { createdAt: "desc" },
  });
  const seen = new Set<string>();
  const out: typeof rows = [];
  for (const r of rows) {
    const k = `${r.genId}:${r.qIndex}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export const attemptRouter = router({
  /** 作答記一筆（前端答題/翻卡當下打） */
  log: publicProcedure
    .input(
      z.object({
        genId: z.string(),
        qIndex: z.number().int().min(0).max(500),
        picked: z.number().int().min(0).max(20).optional(),
        correct: z.boolean(),
        confidence: confidence.default("med"),
      }),
    )
    .mutation(async ({ input }) => {
      const gen = await db.generation.findUnique({ where: { id: input.genId } });
      if (!gen || (gen.type !== "quiz" && gen.type !== "flashcards")) throw new Error("找不到這份測驗/閃卡");
      await db.attempt.create({
        data: {
          genId: input.genId,
          noteId: gen.noteId,
          kind: gen.type,
          qIndex: input.qIndex,
          picked: input.picked,
          correct: input.correct,
          confidence: input.confidence,
        },
      });
      // A2：作答後 upsert 複習卡（越界 qIndex 會被 quarantine、不建卡，Attempt 照寫）
      await recordAttempt({
        genId: input.genId,
        qIndex: input.qIndex,
        correct: input.correct,
        confidence: input.confidence,
      });
      return { ok: true };
    }),

  /** 盲點分析：高信心錯題＋信心校準率＋各題最新狀態 */
  stats: publicProcedure.input(z.object({ noteId: z.string() })).query(async ({ input }) => {
    const attempts = await latestByQ(input.noteId);
    if (attempts.length === 0) {
      return { total: 0, blindSpots: [], calib: null as null | { high: string; med: string; low: string }, answered: 0 };
    }
    const genIds = [...new Set(attempts.map((a) => a.genId))];
    const gens = await db.generation.findMany({ where: { id: { in: genIds } } });
    const quizMap = new Map<string, QuizItem[]>();
    for (const g of gens) {
      if (g.type !== "quiz" || !g.result) continue;
      try {
        quizMap.set(g.id, JSON.parse(g.result) as QuizItem[]);
      } catch {
        /* ignore */
      }
    }
    const blindSpots: { genId: string; qIndex: number; question: string; picked: string; answer: string }[] = [];
    const cal: Record<string, { total: number; correct: number }> = {
      high: { total: 0, correct: 0 },
      med: { total: 0, correct: 0 },
      low: { total: 0, correct: 0 },
    };
    for (const a of attempts) {
      const c = cal[a.confidence] ?? cal.med;
      c.total++;
      if (a.correct) c.correct++;
      // 盲點 = 高信心答錯（只取測驗，閃卡沒有「答錯」概念）
      if (a.kind === "quiz" && a.confidence === "high" && !a.correct) {
        const items = quizMap.get(a.genId);
        const q = items?.[a.qIndex];
        if (q) {
          blindSpots.push({
            genId: a.genId,
            qIndex: a.qIndex,
            question: q.question,
            picked: typeof a.picked === "number" ? (q.options[a.picked] ?? "（未選）") : "（未選）",
            answer: q.options[q.answer] ?? "",
          });
        }
      }
    }
    const rate = (x: { total: number; correct: number }) => (x.total === 0 ? "—" : `${Math.round((x.correct / x.total) * 100)}%`);
    return {
      total: attempts.length,
      answered: attempts.length,
      blindSpots: blindSpots.slice(0, 20),
      calib: { high: rate(cal.high), med: rate(cal.med), low: rate(cal.low) },
    };
  }),
});
