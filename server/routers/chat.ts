import { z } from "zod";
import { db } from "@/lib/db";
import { chatCompletion, getKeyOrThrow, logUsage } from "@/server/llm";
import { publicProcedure, router } from "@/server/trpc";

export const chatRouter = router({
  ask: publicProcedure
    .input(
      z.object({
        message: z.string().min(1).max(8000),
        noteId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const key = await getKeyOrThrow();
      const messages: { role: string; content: string }[] = [];
      if (input.noteId) {
        const note = await db.note.findUnique({ where: { id: input.noteId } });
        if (note) {
          messages.push({
            role: "system",
            content: `你是學習助教。以下是一份筆記，全文引用它回答問題：\n\n${note.rawText.slice(0, 12000)}`,
          });
        }
      } else {
        messages.push({ role: "system", content: "你是學習助教，用繁體中文回答。" });
      }
      messages.push({ role: "user", content: input.message });
      const { text, usage } = await chatCompletion({
        baseUrl: key.baseUrl,
        apiKey: key.apiKey,
        model: key.model,
        messages,
      });
      await logUsage("chat", key.model, usage);
      return { reply: text };
    }),
});
