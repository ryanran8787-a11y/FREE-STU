import { z } from "zod";
import { db } from "@/lib/db";
import { headParagraphs } from "@/lib/paras";
import { chatCompletion, getKeyOrThrow, logUsage } from "@/server/llm";
import { globalStyle, withStyle } from "@/server/style";
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
        if (!note) throw new Error("找不到這份筆記（可能已被刪除），請重選參照筆記");
        const paras = headParagraphs(note.rawText);
        messages.push({
          role: "system",
          content: `你是學習助教，只能根據以下編號段落回答，不要用段落外的知識。引用依據時在句末標段落編號，形如「……[p2]」。用繁體中文回答。\n\n${paras.map((p) => `[${p.id}] ${p.text}`).join("\n")}`,
        });
      } else {
        messages.push({ role: "system", content: "你是學習助教，用繁體中文回答。" });
      }
      messages.push({ role: "user", content: input.message });
      // 全域風格拼在 system 尾（對話無格式契約，不加防呆）
      const style = await globalStyle();
      if (style && messages[0]?.role === "system") {
        messages[0].content = withStyle(messages[0].content, style, false);
      }
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
