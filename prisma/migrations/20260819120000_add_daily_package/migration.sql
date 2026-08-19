-- CreateTable
CREATE TABLE "DailyPackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL DEFAULT 'anonymous',
    "targetLang" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "targetSatzCount" INTEGER NOT NULL,
    "targetVocabCount" INTEGER NOT NULL,
    "targetConjCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" DATETIME,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "DailyPackageItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "refKey" TEXT,
    "domainIdSnapshot" TEXT,
    "grammarTopicBonusApplied" BOOLEAN NOT NULL DEFAULT false,
    "testResult" TEXT NOT NULL DEFAULT 'PENDING',
    "position" INTEGER NOT NULL,
    CONSTRAINT "DailyPackageItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "DailyPackage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailySettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL DEFAULT 'anonymous',
    "targetLang" TEXT NOT NULL,
    "currentGrammarTopicId" TEXT,
    "lastPackageConfig" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "DailyPackage_userId_targetLang_date_idx" ON "DailyPackage"("userId", "targetLang", "date");

-- CreateIndex
CREATE INDEX "DailyPackage_userId_targetLang_status_idx" ON "DailyPackage"("userId", "targetLang", "status");

-- CreateIndex
CREATE INDEX "DailyPackageItem_packageId_position_idx" ON "DailyPackageItem"("packageId", "position");

-- CreateIndex
CREATE INDEX "DailyPackageItem_itemType_refId_idx" ON "DailyPackageItem"("itemType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "DailySettings_userId_targetLang_key" ON "DailySettings"("userId", "targetLang");
