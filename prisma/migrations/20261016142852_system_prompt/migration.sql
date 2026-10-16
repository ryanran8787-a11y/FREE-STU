-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserKey" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "baseUrl" TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "apiKey" TEXT NOT NULL,
    "visionProvider" TEXT,
    "visionBaseUrl" TEXT,
    "visionModel" TEXT,
    "visionApiKey" TEXT,
    "systemPrompt" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_UserKey" ("apiKey", "baseUrl", "id", "model", "provider", "updatedAt", "visionApiKey", "visionBaseUrl", "visionModel", "visionProvider") SELECT "apiKey", "baseUrl", "id", "model", "provider", "updatedAt", "visionApiKey", "visionBaseUrl", "visionModel", "visionProvider" FROM "UserKey";
DROP TABLE "UserKey";
ALTER TABLE "new_UserKey" RENAME TO "UserKey";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
