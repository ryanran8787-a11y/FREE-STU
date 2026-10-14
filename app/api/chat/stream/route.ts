import { db } from "@/lib/db";
import { headParagraphs } from "@/lib/paras";
import { getKeyOrThrow, logUsage } from "@/server/llm";

type ChatMsg = { role: string; content: string };

export async function POST(req: Request) {
  let body: { message?: string; noteId?: string };
  try {
    body = (await req.json()) as { message?: string; noteId?: string };
  } catch {
    return Response.json({ error: "請求格式錯誤" }, { status: 400 });
  }
  const message = (body.message || "").trim().slice(0, 8000);
  if (!message) return Response.json({ error: "訊息為空" }, { status: 400 });

  let key;
  try {
    key = await getKeyOrThrow();
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "未設定 Key" }, { status: 401 });
  }

  const messages: ChatMsg[] = [];
  if (body.noteId) {
    const note = await db.note.findUnique({ where: { id: body.noteId } });
    if (note) {
      const paras = headParagraphs(note.rawText);
      messages.push({
        role: "system",
        content: `你是學習助教，只能根據以下編號段落回答，不要用段落外的知識。引用依據時在句末標段落編號，形如「……[p2]」。用繁體中文回答。\n\n${paras.map((p) => `[${p.id}] ${p.text}`).join("\n")}`,
      });
    }
  } else {
    messages.push({ role: "system", content: "你是學習助教，用繁體中文回答。" });
  }
  messages.push({ role: "user", content: message });

  let upstream: Response;
  try {
    upstream = await fetch(`${key.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key.apiKey}`,
      },
      body: JSON.stringify({
        model: key.model,
        messages,
        temperature: 0.3,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });
  } catch {
    return Response.json({ error: "連不上模型端點" }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return Response.json({ error: `LLM 回應 ${upstream.status}：${text.slice(0, 300)}` }, { status: 502 });
  }

  const model = key.model;
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const reader = upstream.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            for (const line of part.split("\n")) {
              const t = line.trim();
              if (!t.startsWith("data:")) continue;
              const payload = t.slice(5).trim();
              if (payload === "[DONE]") continue;
              try {
                const json = JSON.parse(payload) as {
                  choices?: { delta?: { content?: string } }[];
                  usage?: { prompt_tokens?: number; completion_tokens?: number };
                };
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) send({ delta });
                if (json.usage) {
                  await logUsage("chat", model, {
                    promptTokens: json.usage.prompt_tokens ?? 0,
                    completionTokens: json.usage.completion_tokens ?? 0,
                  });
                }
              } catch {
                /* 忽略髒 chunk */
              }
            }
          }
        }
        send({ done: true });
      } catch (e) {
        send({ error: e instanceof Error ? e.message.slice(0, 200) : "串流中斷" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
