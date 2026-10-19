import { createBackup } from "@/server/backup";
import { restoreBackup } from "@/server/backup/restore";

// 全庫備份下載：GET /api/backup。VACUUM INTO 快照 + 音檔 → zip。
// tRPC 不適合回二進位串流，所以照播客音檔的模式做獨立 route。
export async function GET() {
  try {
    const { name, buf, fileCount } = await createBackup();
    console.log(`[backup] ${name}: ${buf.length} bytes, ${fileCount} files`);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Content-Length": String(buf.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return Response.json(
      { error: `備份失敗：${e instanceof Error ? e.message.slice(0, 200) : "未知錯誤"}` },
      { status: 500 },
    );
  }
}

// 還原：POST /api/backup（multipart form，欄位 file = 之前下載的 zip）。
// 伺服器端會先自動留底（data/backups/pre-restore-*.zip），再覆寫資料庫＋音檔。
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "沒有收到上傳檔（欄位 file）" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".zip")) {
      return Response.json({ error: "只接受本站下載的 .zip 備份" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const r = await restoreBackup(buf);
    return Response.json({
      ok: true,
      restoredFiles: r.restoredFiles.length,
      podcastCount: r.podcastCount,
      autoBackup: r.autoBackupName,
    });
  } catch (e) {
    return Response.json(
      { error: `還原失敗：${e instanceof Error ? e.message.slice(0, 200) : "未知錯誤"}` },
      { status: 500 },
    );
  }
}
