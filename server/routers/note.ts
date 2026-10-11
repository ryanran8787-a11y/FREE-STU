import { z } from "zod";
import { db } from "@/lib/db";
import { publicProcedure, router } from "@/server/trpc";

export const noteRouter = router({
  create: publicProcedure
    .input(z.object({ title: z.string().max(120).default("未命名筆記"), rawText: z.string().min(1).max(60000) }))
    .mutation(async ({ input }) => {
      const note = await db.note.create({ data: input });
      return { id: note.id };
    }),

  list: publicProcedure.query(async () => {
    return db.note.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, createdAt: true, _count: { select: { generations: true } } },
    });
  }),

  get: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    return db.note.findUnique({
      where: { id: input.id },
      include: { generations: { orderBy: { createdAt: "desc" } } },
    });
  }),
});
