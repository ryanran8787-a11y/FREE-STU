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

  getMany: publicProcedure.input(z.object({ ids: z.array(z.string()).max(10) })).query(async ({ input }) => {
    if (input.ids.length === 0) return [];
    return db.note.findMany({
      where: { id: { in: input.ids } },
      select: { id: true, title: true, rawText: true },
    });
  }),

  appendSource: publicProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1).max(120), text: z.string().min(1).max(60000) }))
    .mutation(async ({ input }) => {
      const note = await db.note.findUnique({ where: { id: input.id } });
      if (!note) throw new Error("找不到筆記");
      const section = `\n\n————\n\n【來源：${input.name}】\n\n${input.text.trim()}`;
      const rawText = (note.rawText + section).slice(0, 120000);
      await db.note.update({ where: { id: input.id }, data: { rawText } });
      return { ok: true, chars: rawText.length };
    }),

  remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    await db.note.delete({ where: { id: input.id } });
    return { ok: true };
  }),
});
