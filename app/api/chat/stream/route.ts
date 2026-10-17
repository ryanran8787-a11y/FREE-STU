import { db } from "@/lib/db";
import { headParagraphs } from "@/lib/paras";
import { searchNotes } from "@/lib/retrieval";
import { getKeyOrThrow, logUsage } from "@/server/llm";
import { globalStyle, withStyle } from "@/server/style";

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
  let sourceList: { ref: string; noteId: string; noteTitle: string; text: string }[] = [];
  const usedParaIds: string[] = [];
  if (body.noteId === "*") {
    // 跨筆記檢索：全部筆記切段召回，引用編號 s1..sK
    const notes = await db.note.findMany({ select: { id: true, title: true, rawText: true } });
    const hits = searchNotes(notes, message, 6);
    sourceList = hits.map((h, i) => ({ ref: `s${i + 1}`, noteId: h.noteId, noteTitle: h.noteTitle, text: h.text }));
    usedParaIds.push(...hits.map((h) => h.paraId));
    if (sourceList.length === 0) {
      messages.push({ role: "system", content: "你是學習助教，用繁體中文回答。使用者沒有提供相關筆記，請直接回答並說明這是通用知識、非出自他的筆記。" });
    } else {
      messages.push({
        role: "system",
        content: `你是學習助教，只能根據以下編號段落回答，不要用段落外的知識。引用依據時在句末標編號，形如「……[s2]」。用繁體中文回答。\n\n${sourceList.map((s) => `[${s.ref}]（《${s.noteTitle}》） ${s.text}`).join("\n")}`,
      });
    }
  } else if (body.noteId) {
    const note = await db.note.findUnique({ where: { id: body.noteId } });
    if (!note) return Response.json({ error: "找不到這份筆記（可能已被刪除），請重選參照筆記" }, { status: 404 });
    const paras = headParagraphs(note.rawText);
    messages.push({
      role: "system",
      content: `你是學習助教，只能根據以下編號段落回答，不要用段落外的知識。引用依據時在句末標段落編號，形如「……[p2]」。用繁體中文回答。\n\n${paras.map((p) => `[${p.id}] ${p.text}`).join("\n")}`,
    });
    usedParaIds.push(...paras.map((p) => p.id));
  } else {
    messages.push({ role: "system", content: "你是學習助教，用繁體中文回答。" });
  }
  messages.push({ role: "user", content: message });
  // 雙向追蹤：把這輪提供的段落 ID 記下來，前端 done 後呼叫 link.logChat 寫入
  // （不寫在這裡，避免 SSE 期間每個 chunk 寫 DB）
  void usedParaIds;
  const style = await globalStyle();
  if (style && messages[0]?.role === "system") {
    messages[0].content = withStyle(messages[0].content, style, false);
  }

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
      // 串流回答可能很長，寬限到 3 分鐘；卡死至少會變成錯誤而不是無限轉圈
      signal: AbortSignal.timeout(180000),
    });
  } catch {
    return Response.json({ error: "連不上模型端點" }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return Response.json({ error: `LLM 回應 ${upstream.status}：${text.slice(0, 300)}` }, { status: 502 });
  }

  const model = key.model;
  const initialSources = sourceList;
  let upstreamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  // 前端按停止（abort）時把上游也掐掉，不然 server 端繼續燒 token 燒完為止
  req.signal.addEventListener("abort", () => {
    try {
      upstreamReader?.cancel();
    } catch {
      /* ignore */
    }
  });
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      if (initialSources.length > 0) send({ sources: initialSources });
      upstreamReader = upstream.body!.getReader();
      const reader = upstreamReader;
      const dec = new TextDecoder();
      let buf = "";
      let usageLogged = false;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          // F-3：部分供應商發 \r\n，直接 split("\n\n") 會永遠切不開、畫面卡死
          buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
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
                // 有些供應商每個 chunk 都帶 usage，只記第一次，免得用量翻倍
                if (json.usage && !usageLogged) {
                  usageLogged = true;
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
