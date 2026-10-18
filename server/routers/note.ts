import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { normalizeTags } from "@/lib/tokens";
import { indexNote, removeNote } from "@/server/search";
import { publicProcedure, router } from "@/server/trpc";

export const noteRouter = router({
  create: publicProcedure
    .input(
      z.object({
        title: z.string().max(120).default("未命名筆記"),
        rawText: z.string().min(1).max(60000),
        tags: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const note = await db.note.create({
        data: { title: input.title, rawText: input.rawText, tags: normalizeTags(input.tags ?? "") },
      });
      // 索引失敗不能擋建立（搜尋是加值功能），ensureFts 下次查詢會自我修復
      await indexNote(note.id).catch(() => undefined);
      return { id: note.id };
    }),

  list: publicProcedure.query(async () => {
    return db.note.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        tags: true,
        createdAt: true,
        _count: { select: { generations: true } },
      },
    });
  }),

  /** 改標籤：整串覆蓋（前端送逗號分隔字串），同步重索引讓標籤可被搜尋。 */
  setTags: publicProcedure
    .input(z.object({ id: z.string(), tags: z.string().max(200) }))
    .mutation(async ({ input }) => {
      const tags = normalizeTags(input.tags);
      const r = await db.note.updateMany({ where: { id: input.id }, data: { tags } });
      if (r.count === 0) throw new Error("找不到筆記");
      await indexNote(input.id).catch(() => undefined);
      return { ok: true, tags };
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
      await indexNote(input.id).catch(() => undefined);
      return { ok: true, chars: rawText.length };
    }),

  remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const gens = await db.generation.findMany({ where: { noteId: input.id }, select: { id: true } });
    await db.note.delete({ where: { id: input.id } });
    await removeNote(input.id).catch(() => undefined);
    // A2：ReviewCard 無 FK，筆記刪掉後手動清卡（避免孤兒卡）
    await db.reviewCard.deleteMany({ where: { noteId: input.id } }).catch(() => undefined);
    // 連帶清播客音檔（SQLite cascade 只刪 row，磁碟檔自己清）
    for (const g of gens) {
      await fs.unlink(path.join(process.cwd(), "data", "podcasts", `${g.id}.mp3`)).catch(() => undefined);
    }
    return { ok: true };
  }),
});
