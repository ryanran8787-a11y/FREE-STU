// OCR 雙軌：視覺模型（高精度，需 key）/ 本地鏈（免費，tesseract）。
// PDF→圖的渲染層兩條路共用。無 key 時自動降級本地。

import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { Canvas, DOMMatrix, ImageData, Path2D, createCanvas } from "@napi-rs/canvas";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createWorker, type Worker } from "tesseract.js";

// pdfjs 在 Node 下需要的 DOM polyfill
const g = globalThis as unknown as Record<string, unknown>;
if (!g.DOMMatrix) g.DOMMatrix = DOMMatrix;
if (!g.Path2D) g.Path2D = Path2D;
if (!g.ImageData) g.ImageData = ImageData;

export type VisionKey = { baseUrl: string; apiKey: string; model: string } | null;

export async function getVisionKey(): Promise<VisionKey> {
  const { db } = await import("@/lib/db");
  const row = await db.userKey.findUnique({ where: { id: "default" } });
  if (!row?.visionApiKey || !row.visionBaseUrl || !row.visionModel) return null;
  return { baseUrl: row.visionBaseUrl, apiKey: row.visionApiKey, model: row.visionModel };
}

async function loadPdf(buf: Buffer) {
  return pdfjsLib
    .getDocument({
      data: new Uint8Array(buf),
      useWorkerFetch: false,
      useSystemFonts: true,
      standardFontDataUrl: pathToFileURL(path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/") + path.sep).href,
    })
    .promise;
}

export async function pdfPageText(buf: Buffer, pageNum: number): Promise<string> {
  const doc = await loadPdf(buf);
  if (pageNum > doc.numPages) return "";
  const page = await doc.getPage(pageNum);
  const content = await page.getTextContent();
  return content.items.map((it) => ("str" in it ? (it.str as string) : "")).join(" ");
}

export async function pdfPageCount(buf: Buffer): Promise<number> {
  const doc = await loadPdf(buf);
  return doc.numPages;
}

export async function renderPdfPageToPng(buf: Buffer, pageNum: number, scale = 2): Promise<Buffer> {
  const doc = await loadPdf(buf);
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
  return Buffer.from(await canvas.encode("png"));
}

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      // 語言包改放使用者資料目錄（別污染專案），用標準 tessdata（非 fast，中文準得多）。
      // chi_tra + eng；首次自動下載快取（約數十 MB）。
      const base = process.env.LOCALAPPDATA || path.join(os.homedir(), ".free-stu");
      const worker = await createWorker(["chi_tra", "eng"], undefined, {
        langPath: "https://tessdata.projectnaptha.com/4.0.0",
        cachePath: path.join(base, "free-stu", "tessdata"),
      });
      return worker;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

export async function ocrLocal(png: Buffer): Promise<string> {
  const worker = await getWorker();
  const { data } = await worker.recognize(png);
  // tesseract 會在中日韓字間塞空格，清掉
  return (data.text || "").trim().replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2");
}

export async function ocrVision(png: Buffer, key: Exclude<VisionKey, null>): Promise<string> {
  const b64 = png.toString("base64");
  const res = await fetch(`${key.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key.apiKey}` },
    body: JSON.stringify({
      model: key.model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "轉錄這張文件掃描圖中的所有文字，保持版面結構（段落分行，表格用 Markdown 表格）。只輸出轉錄文字，不要其他內容。" },
            { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`視覺模型回應 ${res.status}：${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (json.choices?.[0]?.message?.content || "").trim();
}

/** 單頁 OCR：有視覺 key 走視覺，否則本地鏈 */
export async function ocrPage(
  pdfBuf: Buffer,
  pageNum: number,
): Promise<{ text: string; engine: "vision" | "local" }> {
  const png = await renderPdfPageToPng(pdfBuf, pageNum);
  const vision = await getVisionKey();
  if (vision) {
    return { text: await ocrVision(png, vision), engine: "vision" };
  }
  return { text: await ocrLocal(png), engine: "local" };
}

// 避免 Canvas 未使用警告（型別引用）
void Canvas;
