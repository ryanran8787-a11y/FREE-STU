-- CreateTable
CREATE TABLE "ReviewCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "genId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'quiz',
    "qIndex" INTEGER NOT NULL,
    "question" TEXT NOT NULL DEFAULT '',
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "dueAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ReviewCard_dueAt_idx" ON "ReviewCard"("dueAt");

-- CreateIndex
CREATE INDEX "ReviewCard_noteId_idx" ON "ReviewCard"("noteId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewCard_genId_qIndex_key" ON "ReviewCard"("genId", "qIndex");
