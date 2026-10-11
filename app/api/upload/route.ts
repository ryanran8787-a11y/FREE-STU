import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { db } from "@/lib/db";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_CHARS = 60000;

async function extractPdf(buf: Buffer): Promise<string> {
  const doc = await pdfjsLib
    .getDocument({
      data: new Uint8Array(buf),
      useWorkerFetch: false,
      useSystemFonts: true,
    })
    .promise;
  const parts: string[] = [];
  const pages = Math.min(doc.numPages, 200);
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    parts.push(content.items.map((it) => ("str" in it ? (it.str as string) : "")).join(" "));
  }
  return parts.join("\n");
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "沒有收到檔案（欄位 file）" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "檔案超過 10MB" }, { status: 400 });
    }
    const name = file.name || "未命名";
    const lower = name.toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());
    let text: string;
    if (lower.endsWith(".pdf")) {
      text = await extractPdf(buf);
    } else if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".markdown")) {
      text = buf.toString("utf-8");
    } else {
      return Response.json({ error: "只支援 .txt / .md / .pdf" }, { status: 400 });
    }
    text = text.replace(/\r/g, "").trim();
    if (!text) {
      return Response.json({ error: "檔案裡沒抓到文字（掃描版 PDF 需要先 OCR）" }, { status: 400 });
    }
    const note = await db.note.create({
      data: { title: name.replace(/\.[^.]+$/, "").slice(0, 120) || "未命名筆記", rawText: text.slice(0, MAX_CHARS) },
    });
    return Response.json({ id: note.id, chars: Math.min(text.length, MAX_CHARS) });
  } catch (e) {
    return Response.json(
      { error: `解析失敗：${e instanceof Error ? e.message.slice(0, 200) : "未知錯誤"}` },
      { status: 500 },
    );
  }
}
