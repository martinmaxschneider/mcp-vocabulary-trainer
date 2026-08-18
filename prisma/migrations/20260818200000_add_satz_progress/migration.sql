-- CreateTable
CREATE TABLE "SatzProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL DEFAULT 'anonymous',
    "satzId" TEXT NOT NULL,
    "targetLang" TEXT NOT NULL,
    "box" INTEGER NOT NULL DEFAULT 1,
    "nextReviewAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SatzProgress_satzId_fkey" FOREIGN KEY ("satzId") REFERENCES "Satz" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SatzReviewLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "satzProgressId" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SatzReviewLog_satzProgressId_fkey" FOREIGN KEY ("satzProgressId") REFERENCES "SatzProgress" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SatzProgress_userId_satzId_targetLang_key" ON "SatzProgress"("userId", "satzId", "targetLang");

-- CreateIndex
CREATE INDEX "SatzProgress_userId_targetLang_nextReviewAt_idx" ON "SatzProgress"("userId", "targetLang", "nextReviewAt");

-- CreateIndex
CREATE INDEX "SatzProgress_userId_targetLang_box_idx" ON "SatzProgress"("userId", "targetLang", "box");

-- CreateIndex
CREATE INDEX "SatzReviewLog_satzProgressId_idx" ON "SatzReviewLog"("satzProgressId");

-- CreateIndex
CREATE INDEX "SatzReviewLog_createdAt_idx" ON "SatzReviewLog"("createdAt");
