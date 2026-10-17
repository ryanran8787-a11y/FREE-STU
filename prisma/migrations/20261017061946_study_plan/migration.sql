-- CreateTable
CREATE TABLE "StudyPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "result" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudyPlan_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StudyPlan_noteId_createdAt_idx" ON "StudyPlan"("noteId", "createdAt");
