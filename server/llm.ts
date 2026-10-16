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
}): Promise<{ text: string; usage: { promptTokens: number; completionTokens: number } }> {
  // F-2：無 timeout 的 fetch 卡死會讓生成任務永遠 running（CAS 只認 pending，重試也救不回）
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
    signal: AbortSignal.timeout(120000),
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
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "LLM 回傳為空" });
  return {
    text: content,
    usage: {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
    },
  };
}

export async function logUsage(kind: string, model: string, usage: { promptTokens: number; completionTokens: number }) {
  try {
    await db.usage.create({
      data: { kind, model, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens },
    });
  } catch {
    // 記賬失敗不影響主流程
  }
}

export function parseJsonArray(text: string): unknown[] {
  const tries: string[] = [text.trim()];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) tries.push(fenced[1].trim());
  // 兜底：從第一個 [ 掃到配對的 ]（LLM 愛在前後加廢話）
  const start = text.indexOf("[");
  if (start !== -1) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') {
        inStr = true;
      } else if (ch === "[") {
        depth++;
      } else if (ch === "]") {
        depth--;
        if (depth === 0) {
          tries.push(text.slice(start, i + 1));
          break;
        }
      }
    }
  }
  const errors: string[] = [];
  for (const t of tries) {
    try {
      const parsed: unknown = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed;
      errors.push("回傳不是陣列");
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "解析失敗");
    }
  }
  throw new Error(`JSON 解析失敗：${errors[0] ?? "未知"}`);
}
