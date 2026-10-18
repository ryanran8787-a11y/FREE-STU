import { createBackup } from "@/server/backup";

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
