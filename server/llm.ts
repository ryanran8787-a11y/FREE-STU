import { TRPCError } from "@trpc/server";
import { db } from "@/lib/db";

export async function getKeyOrThrow() {
  const key = await db.userKey.findUnique({ where: { id: "default" } });
  if (!key) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "還沒設定 API Key，先去設定頁填" });
  }
  return key;
}

export async function chatCompletion(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
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
      temperature: opts.temperature ?? 0.3,
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

export function parseJsonArray(text: string): unknown[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const parsed: unknown = JSON.parse(candidate);
  if (!Array.isArray(parsed)) throw new Error("回傳不是陣列");
  return parsed;
}
