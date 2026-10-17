-- CreateTable
CREATE TABLE "UsageLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "paraId" TEXT NOT NULL,
    "genId" TEXT,
    "kind" TEXT NOT NULL,
    "ref" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "UsageLink_noteId_paraId_idx" ON "UsageLink"("noteId", "paraId");

-- CreateIndex
CREATE INDEX "UsageLink_genId_idx" ON "UsageLink"("genId");
