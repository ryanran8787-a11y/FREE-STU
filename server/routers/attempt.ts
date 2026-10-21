import { z } from "zod";
import { db } from "@/lib/db";
import { publicProcedure, router } from "@/server/trpc";
import { gradeQuiz, parseQuizItems } from "@/lib/quiz";
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
  /** 作答記一筆（前端答題/翻卡當下打）。T1-1：quiz 只收 picked，correct 由 server 判（不再信前端）。 */
  log: publicProcedure
    .input(
      z.object({
        genId: z.string(),
        qIndex: z.number().int().min(0).max(500),
        picked: z.number().int().min(0).max(20).optional(),
        /** 舊客戶端相容：flashcards 自評保留；quiz 若同時傳以 server 算為準。 */
        correct: z.boolean().optional(),
        confidence: confidence.default("med"),
      }),
    )
    .mutation(async ({ input }) => {
      const gen = await db.generation.findUnique({ where: { id: input.genId } });
      if (!gen || (gen.type !== "quiz" && gen.type !== "flashcards")) throw new Error("找不到這份測驗/閃卡");
      // quiz：server 判分唯一真相源（Top-1 卡片協議：判前不洩答案，前端只傳 picked）。
      // flashcards：自評，correct 由前端傳（沒傳就當作「記得」true？不——缺 correct 直接報錯，避免髒資料）。
      let correct: boolean;
      let answer: number | undefined;
      if (gen.type === "quiz") {
        if (typeof input.picked !== "number") throw new Error("測驗作答需傳 picked");
        const items = parseQuizItems(gen.result);
        const g = gradeQuiz(items, input.qIndex, input.picked);
        correct = g.correct;
        answer = g.answer;
      } else {
        if (typeof input.correct !== "boolean") throw new Error("閃卡自評需傳 correct");
        correct = input.correct;
      }
      const created = await db.attempt.create({
        data: {
          genId: input.genId,
          noteId: gen.noteId,
          kind: gen.type,
          qIndex: input.qIndex,
          picked: input.picked,
          correct,
          confidence: input.confidence,
        },
      });
      // A2：作答後 upsert 複習卡（越界 qIndex 會被 quarantine、不建卡，Attempt 照寫）
      // 傳 attemptId：T3-2 舊卡遷移重播要排除「當次」這筆，否則當次會被算兩步（Again 套用兩次）。
      await recordAttempt({
        genId: input.genId,
        qIndex: input.qIndex,
        correct,
        confidence: input.confidence,
        attemptId: created.id,
      });
      // 判後釋放：只釋放該題（DeepTutor build_grade_result 語義）。
      return answer === undefined ? { ok: true as const, correct } : { ok: true as const, correct, answer };
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
