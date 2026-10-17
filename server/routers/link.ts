import { z } from "zod";
import { db } from "@/lib/db";
import { publicProcedure, router } from "@/server/trpc";

/** 雙向來源追蹤：某段落被哪些產出引用 */
export const linkRouter = router({
  /** 某段落被哪些生成/聊天引用（反向查詢） */
  byPara: publicProcedure
    .input(z.object({ noteId: z.string(), paraId: z.string() }))
    .query(async ({ input }) => {
      const rows = await db.usageLink.findMany({
        where: { noteId: input.noteId, paraId: input.paraId },
        orderBy: { createdAt: "desc" },
      });
      return rows;
    }),

  /** 某生成用了哪些段落（正向查詢，給歷史卡片用） */
  byGen: publicProcedure.input(z.object({ genId: z.string() })).query(async ({ input }) => {
    return db.usageLink.findMany({ where: { genId: input.genId } });
  }),

  /** 聊天引用寫入（SSE 結束後前端把引用的 paraId 送來） */
  logChat: publicProcedure
    .input(z.object({ noteId: z.string(), paraIds: z.array(z.string()).max(50) }))
    .mutation(async ({ input }) => {
      if (input.paraIds.length === 0) return { ok: true };
      await db.usageLink.createMany({
        data: input.paraIds.map((p) => ({ noteId: input.noteId, paraId: p, kind: "chat" })),
      });
      return { ok: true };
    }),
});
