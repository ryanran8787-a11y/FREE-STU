-- 全文檢索索引（FTS5 虛擬表）。
--
-- 為什麼用手寫遷移：Prisma schema 表達不了 virtual table，若不寫進 migration 歷史，
-- 之後每次 `prisma migrate dev` 都會把 NoteFts 當成 drift，可能誘發 reset 而清掉整個資料庫。
-- 寫進歷史後 shadow DB 重放也會有這張表，drift 偵測就對得上了。
--
-- 索引欄位存的是 lib/tokens 產出的 bigram token 串，不是原文；
-- 內容由 server/search 的 ensureFts／indexNote 維護，此處只負責建表。
-- IF NOT EXISTS 讓它對「ensureFts 已先建過表」的資料庫也能安全套用。
CREATE VIRTUAL TABLE IF NOT EXISTS NoteFts USING fts5(
  noteId UNINDEXED,
  title,
  body,
  tags,
  tokenize='unicode61'
);
