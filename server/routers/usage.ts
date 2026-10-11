import { db } from "@/lib/db";
import { publicProcedure, router } from "@/server/trpc";

export const usageRouter = router({
  stats: publicProcedure.query(async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [today, all, calls] = await Promise.all([
      db.usage.aggregate({
        _sum: { promptTokens: true, completionTokens: true },
        where: { createdAt: { gte: startOfDay } },
      }),
      db.usage.aggregate({
        _sum: { promptTokens: true, completionTokens: true },
      }),
      db.usage.groupBy({
        by: ["kind"],
        _count: { kind: true },
        orderBy: { _count: { kind: "desc" } },
      }),
    ]);
    const sum = (s: { promptTokens: number | null; completionTokens: number | null }) =>
      (s.promptTokens ?? 0) + (s.completionTokens ?? 0);
    return {
      todayTokens: sum(today._sum),
      totalTokens: sum(all._sum),
      calls: calls.map((c) => ({ kind: c.kind, count: c._count.kind })),
    };
  }),
});
