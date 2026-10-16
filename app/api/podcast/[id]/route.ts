import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";

// 播客音檔：GET /api/podcast/<genId>（inline 播放），?download=1 附件下載。支援 Range（可拖進度條）。
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return Response.json({ error: "id 非法" }, { status: 400 });
  }
  const gen = await db.generation.findUnique({ where: { id } });
  if (!gen || gen.type !== "podcast" || gen.status !== "done") {
    return Response.json({ error: "找不到已完成的播客" }, { status: 404 });
  }
  const file = path.join(process.cwd(), "data", "podcasts", `${id}.mp3`);
  let buf: Buffer;
  try {
    buf = await fs.readFile(file);
  } catch {
    return Response.json({ error: "音檔遺失（可能被手動刪除）" }, { status: 404 });
  }
  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=86400",
  };
  if (download) {
    const safe = `podcast-${id.slice(-6)}.mp3`;
    headers["Content-Disposition"] = `attachment; filename="${safe}"`;
  }
  const range = req.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      const total = buf.length;
      const start = m[1] === "" ? Math.max(0, total - parseInt(m[2] || "0", 10)) : parseInt(m[1], 10);
      const end = m[2] === "" ? total - 1 : Math.min(total - 1, parseInt(m[2], 10));
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < total) {
        headers["Content-Range"] = `bytes ${start}-${end}/${total}`;
        headers["Content-Length"] = String(end - start + 1);
        return new Response(new Uint8Array(buf.subarray(start, end + 1)), { status: 206, headers });
      }
    }
  }
  headers["Content-Length"] = String(buf.length);
  return new Response(new Uint8Array(buf), { headers });
}
