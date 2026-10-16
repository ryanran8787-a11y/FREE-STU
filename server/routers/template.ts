import { z } from "zod";
import { db } from "@/lib/db";
import { publicProcedure, router } from "@/server/trpc";

/** 自訂 Prompt 模板（第三層編輯器存的版本）。內建三範本在 server/custom.ts，不進 DB。 */
export const templateRouter = router({
  list: publicProcedure.query(async () => {
    return db.customTemplate.findMany({ orderBy: { updatedAt: "desc" } });
  }),

  create: publicProcedure
    .input(z.object({ name: z.string().trim().min(1).max(60), body: z.string().trim().min(1).max(8000) }))
    .mutation(async ({ input }) => {
      const tpl = await db.customTemplate.create({ data: input });
      return { id: tpl.id };
    }),

  update: publicProcedure
    .input(z.object({ id: z.string(), name: z.string().trim().min(1).max(60), body: z.string().trim().min(1).max(8000) }))
    .mutation(async ({ input }) => {
      const tpl = await db.customTemplate.findUnique({ where: { id: input.id } });
      if (!tpl) throw new Error("找不到這個模板");
      await db.customTemplate.update({ where: { id: input.id }, data: { name: input.name, body: input.body } });
      return { ok: true };
    }),

  remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    await db.customTemplate.delete({ where: { id: input.id } }).catch(() => undefined);
    return { ok: true };
  }),
});
