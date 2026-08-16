-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL DEFAULT 'anonymous',
    "entryId" TEXT NOT NULL,
    "targetLang" TEXT NOT NULL DEFAULT 'en',
    "cardType" TEXT NOT NULL DEFAULT 'VOCAB',
    "cardKey" TEXT NOT NULL DEFAULT 'vocab',
    "box" INTEGER NOT NULL DEFAULT 1,
    "nextReviewAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserProgress_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserProgress" ("id", "userId", "entryId", "targetLang", "box", "nextReviewAt", "correctCount", "wrongCount", "lastReviewedAt", "createdAt", "updatedAt")
SELECT "id", "userId", "entryId", "targetLang", "box", "nextReviewAt", "correctCount", "wrongCount", "lastReviewedAt", "createdAt", "updatedAt"
FROM "UserProgress";
DROP TABLE "UserProgress";
ALTER TABLE "new_UserProgress" RENAME TO "UserProgress";
CREATE UNIQUE INDEX "UserProgress_userId_entryId_targetLang_cardKey_key" ON "UserProgress"("userId", "entryId", "targetLang", "cardKey");
CREATE INDEX "UserProgress_userId_targetLang_box_idx" ON "UserProgress"("userId", "targetLang", "box");
CREATE INDEX "UserProgress_userId_targetLang_nextReviewAt_idx" ON "UserProgress"("userId", "targetLang", "nextReviewAt");
CREATE INDEX "UserProgress_userId_nextReviewAt_idx" ON "UserProgress"("userId", "nextReviewAt");
CREATE INDEX "UserProgress_userId_targetLang_cardType_nextReviewAt_idx" ON "UserProgress"("userId", "targetLang", "cardType", "nextReviewAt");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
