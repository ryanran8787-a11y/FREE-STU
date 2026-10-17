-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "genId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'quiz',
    "qIndex" INTEGER NOT NULL,
    "picked" INTEGER,
    "correct" BOOLEAN NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'med',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Attempt_noteId_createdAt_idx" ON "Attempt"("noteId", "createdAt");
