import { z } from "zod";
import { rebuildAll, searchNotes } from "@/server/search";
import { publicProcedure, router } from "@/server/trpc";

/** 全文檢索：FTS5 索引（中文 bigram）＋標題/標籤加權，零外部依賴。 */
export const searchRouter = router({
  query: publicProcedure
    .input(z.object({ q: z.string().max(200), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      const q = input.q.trim();
      if (q.length === 0) return { hits: [], q };
      return { hits: await searchNotes(q, input.limit), q };
    }),

  /** 索引維護：整庫重建（設定頁備援用；正常情況下 ensureFts 會自我修復）。 */
  rebuild: publicProcedure.mutation(async () => {
    return { ok: true, indexed: await rebuildAll() };
  }),
});
