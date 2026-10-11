import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { publicProcedure, router } from "@/server/trpc";

async function chatCompletion(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
}): Promise<string> {
  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `LLM 回應 ${res.status}：${text.slice(0, 300)}`,
    });
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "LLM 回傳為空" });
  return content;
}

export const chatRouter = router({
  ask: publicProcedure
    .input(
      z.object({
        message: z.string().min(1).max(8000),
        noteId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const key = await db.userKey.findUnique({ where: { id: "default" } });
      if (!key) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "還沒設定 API Key，先去設定頁填" });
      }
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
      const reply = await chatCompletion({
        baseUrl: key.baseUrl,
        apiKey: key.apiKey,
        model: key.model,
        messages,
      });
      return { reply };
    }),
});
