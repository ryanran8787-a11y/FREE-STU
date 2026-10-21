/*
  Warnings:

  - You are about to alter the column `intervalDays` on the `ReviewCard` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Float`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReviewCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "genId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'quiz',
    "qIndex" INTEGER NOT NULL,
    "question" TEXT NOT NULL DEFAULT '',
    "intervalDays" REAL NOT NULL DEFAULT 0,
    "ease" REAL NOT NULL DEFAULT 2.5,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "dueAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ReviewCard" ("dueAt", "genId", "id", "intervalDays", "kind", "lapses", "noteId", "qIndex", "question", "updatedAt") SELECT "dueAt", "genId", "id", "intervalDays", "kind", "lapses", "noteId", "qIndex", "question", "updatedAt" FROM "ReviewCard";
DROP TABLE "ReviewCard";
ALTER TABLE "new_ReviewCard" RENAME TO "ReviewCard";
CREATE INDEX "ReviewCard_dueAt_idx" ON "ReviewCard"("dueAt");
CREATE INDEX "ReviewCard_noteId_idx" ON "ReviewCard"("noteId");
CREATE UNIQUE INDEX "ReviewCard_genId_qIndex_key" ON "ReviewCard"("genId", "qIndex");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
