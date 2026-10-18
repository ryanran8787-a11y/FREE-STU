import mammoth from "mammoth";
import { db } from "@/lib/db";
import { ocrPage, pdfPageCount, pdfPageText } from "@/server/ocr";
import { indexNote } from "@/server/search";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_CHARS = 60000;
// 單次上傳最多 OCR 幾頁（本地鏈一頁數秒，避免請求超時）
const MAX_OCR_PAGES = 20;

async function extractDocx(buf: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value;
}

async function extractPdf(buf: Buffer): Promise<{ text: string; ocrPages: number; skipped: number }> {
  const total = await pdfPageCount(buf);
  const parts: string[] = [];
  let ocrPages = 0;
  let skipped = 0;
  for (let i = 1; i <= total; i++) {
    const text = (await pdfPageText(buf, i)).trim();
    if (text.length >= 30) {
      parts.push(text);
      continue;
    }
    // 疑似掃描頁：沒什麼文字層
    if (ocrPages >= MAX_OCR_PAGES) {
      skipped++;
      continue;
    }
    const { text: ocrText, engine } = await ocrPage(buf, i);
    ocrPages++;
    parts.push(ocrText ? `【OCR-第${i}頁·${engine === "vision" ? "視覺" : "本地"}】\n${ocrText}` : `【第${i}頁：空白或無法辨識】`);
  }
  return { text: parts.join("\n\n"), ocrPages, skipped };
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
    let suffix = "";
    if (lower.endsWith(".pdf")) {
      const { text: pdfText, ocrPages, skipped } = await extractPdf(buf);
      text = pdfText;
      if (ocrPages > 0) suffix = `（${ocrPages} 頁 OCR）`;
      if (skipped > 0) suffix += `（另有 ${skipped} 頁掃描頁超出上限未處理）`;
    } else if (lower.endsWith(".docx")) {
      text = await extractDocx(buf);
    } else if (lower.endsWith(".doc")) {
      return Response.json({ error: "舊版 .doc 不支援，請用 Word 另存為 .docx 後上傳" }, { status: 400 });
    } else if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".markdown")) {
      text = buf.toString("utf-8");
    } else {
      return Response.json({ error: "只支援 .txt / .md / .docx / .pdf" }, { status: 400 });
    }
    text = text.replace(/\r/g, "").trim();
    if (!text) {
      return Response.json({ error: "檔案裡沒抓到文字（掃描版 PDF 若持續為空，試試視覺 OCR）" }, { status: 400 });
    }
    const title = (name.replace(/\.[^.]+$/, "").slice(0, 120) || "未命名筆記") + suffix;
    const note = await db.note.create({
      data: { title, rawText: text.slice(0, MAX_CHARS) },
    });
    // 同步全文索引；失敗不擋上傳（搜尋是加值功能，ensureFts 會自我修復）
    await indexNote(note.id).catch(() => undefined);
    return Response.json({ id: note.id, chars: Math.min(text.length, MAX_CHARS) });
  } catch (e) {
    return Response.json(
      { error: `解析失敗：${e instanceof Error ? e.message.slice(0, 200) : "未知錯誤"}` },
      { status: 500 },
    );
  }
}
