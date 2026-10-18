// 全文檢索深模組：FTS5 索引的建立、同步與查詢，全部收在這裡。
//
// 對外只開四個口：ensureFts（確保索引可用）、indexNote／removeNote（寫入路徑同步）、
// searchNotes（查詢）、rebuildAll（整庫重建）。router 與 upload 都只碰這幾個。
//
// 索引內容是 lib/tokens 產出的 bigram token 串（不是原文），因為 SQLite 內建分詞器
// 對中文都不合用（詳見 lib/tokens.ts 的說明）。顯示用的摘要另外從 Note.rawText 現切，
// 所以索引再怎麼斷詞都不影響呈現。

import { db } from "@/lib/db";
import { indexTokens, makeSnippet, matchQuery, queryTerms } from "@/lib/tokens";

export type SearchHit = {
  noteId: string;
  title: string;
  tags: string[];
  snippet: string;
  genCount: number;
  createdAt: Date;
  score: number;
};

/** bm25 欄位權重（依 fts5 建表欄位順序）：noteId 不索引、標題重、內文次之、標籤中間。 */
const BM25 = "bm25(NoteFts, 0.0, 10.0, 1.0, 5.0)";

let ftsReady: Promise<void> | null = null;

/**
 * 確保 FTS 表存在且與 Note 同步。
 * - 表不存在 → 建表＋整庫回填（首次部署或剛 migrate 完）。
 * - 表存在但筆數對不上 → 整庫重建（有人直接動 DB、或遷移後殘留）。
 * 併發呼叫共用同一個 promise，避免同時建表。
 */
export function ensureFts(): Promise<void> {
  ftsReady ??= (async () => {
    await db.$executeRawUnsafe(
      `CREATE VIRTUAL TABLE IF NOT EXISTS NoteFts USING fts5(noteId UNINDEXED, title, body, tags, tokenize='unicode61')`,
    );
    const [{ c }] = await db.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*) AS c FROM NoteFts`);
    const [{ c: notes }] = await db.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*) AS c FROM "Note"`);
    if (Number(c) !== Number(notes)) await rebuildAll();
  })().catch((e) => {
    // 失敗就放掉快取，讓下一次查詢重試（例如 migrate 還沒跑完）
    ftsReady = null;
    throw e;
  });
  return ftsReady;
}

/** 整庫重建索引：一次讀出所有筆記，分批寫入。 */
export async function rebuildAll(): Promise<number> {
  await db.$executeRawUnsafe(`DELETE FROM NoteFts`);
  const notes = await db.note.findMany({ select: { id: true, title: true, rawText: true, tags: true } });
  const CHUNK = 200;
  for (let i = 0; i < notes.length; i += CHUNK) {
    await Promise.all(notes.slice(i, i + CHUNK).map((n) => writeRow(n.id, n.title, n.rawText, n.tags)));
  }
  return notes.length;
}

async function writeRow(id: string, title: string, rawText: string, tags: string): Promise<void> {
  await db.$executeRawUnsafe(`DELETE FROM NoteFts WHERE noteId = ?`, id);
  await db.$executeRawUnsafe(
    `INSERT INTO NoteFts(noteId, title, body, tags) VALUES (?, ?, ?, ?)`,
    id,
    indexTokens(title),
    indexTokens(rawText),
    // 標籤整串也當內文索引（「#生物」這種寫法去掉 # 後才查得到）
    indexTokens(tags.replace(/#/g, " ")),
  );
}

/** 單篇（重新）索引：內容變更後呼叫，讀 DB 現況覆蓋索引列。 */
export async function indexNote(noteId: string): Promise<void> {
  await ensureFts();
  const note = await db.note.findUnique({
    where: { id: noteId },
    select: { id: true, title: true, rawText: true, tags: true },
  });
  if (!note) {
    await removeNote(noteId);
    return;
  }
  await writeRow(note.id, note.title, note.rawText, note.tags);
}

/** 移除索引列（刪筆記時呼叫；找不到就當已清掉）。 */
export async function removeNote(noteId: string): Promise<void> {
  await ensureFts();
  await db.$executeRawUnsafe(`DELETE FROM NoteFts WHERE noteId = ?`, noteId);
}

/** 查詢：FTS5 MATCH 取候選 → 標題/標籤加權 → 現切摘要。查不到或查詢為空回 []。 */
export async function searchNotes(query: string, limit = 20): Promise<SearchHit[]> {
  const match = matchQuery(query);
  if (!match) return [];
  await ensureFts();
  const terms = queryTerms(query);
  const rows = await db.$queryRawUnsafe<
    { noteId: string; score: number; title: string; rawText: string; tags: string; createdAt: Date }[]
  >(
    `SELECT NoteFts.noteId AS noteId, ${BM25} AS score, n.title AS title, n.rawText AS rawText,
            n.tags AS tags, n.createdAt AS createdAt
       FROM NoteFts JOIN "Note" n ON n.id = NoteFts.noteId
      WHERE NoteFts MATCH ?
      ORDER BY score
      LIMIT ?`,
    match,
    // 撈比 limit 多一點，加權重排後再截，避免標題命中被 bm25 擠出榜外
    Math.min(limit * 3, 100),
  );
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.noteId);
  const counts = await db.generation.groupBy({
    by: ["noteId"],
    where: { noteId: { in: ids } },
    _count: { _all: true },
  });
  const genOf = new Map(counts.map((c) => [c.noteId, c._count._all]));
  const scored = rows.map((r) => {
    const low = r.title.toLowerCase();
    const tagLow = r.tags.toLowerCase();
    let bonus = 0;
    for (const t of terms) {
      if (low.includes(t.toLowerCase())) bonus += 10;
      if (tagLow.includes(t.toLowerCase())) bonus += 6;
    }
    return {
      noteId: r.noteId,
      title: r.title,
      tags: r.tags.split(",").map((s) => s.trim()).filter(Boolean),
      snippet: makeSnippet(r.rawText, terms),
      genCount: genOf.get(r.noteId) ?? 0,
      createdAt: r.createdAt,
      // bm25 越小越相關（負值），取負轉成越大越相關的好讀分數，再加權
      score: -r.score + bonus,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
