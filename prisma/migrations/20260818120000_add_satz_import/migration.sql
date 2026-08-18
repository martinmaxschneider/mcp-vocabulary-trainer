-- CreateTable
CREATE TABLE "SatzImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SatzImportDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "mainText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "skip" BOOLEAN NOT NULL DEFAULT false,
    "trigger" TEXT,
    "source" TEXT NOT NULL DEFAULT 'GENERIC',
    "priority" TEXT NOT NULL DEFAULT 'OCCASIONAL',
    "register" TEXT NOT NULL DEFAULT 'INFORMAL',
    "translations" JSONB,
    "domainIds" JSONB,
    "linkedEntryIds" JSONB,
    "duplicateCandidates" JSONB,
    "vocabCandidates" JSONB,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "allowSimilar" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "committedSatzId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SatzImportDraft_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SatzImportBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SatzImportBatch_updatedAt_idx" ON "SatzImportBatch"("updatedAt");

-- CreateIndex
CREATE INDEX "SatzImportDraft_batchId_status_idx" ON "SatzImportDraft"("batchId", "status");

-- CreateIndex
CREATE INDEX "SatzImportDraft_batchId_rowNumber_idx" ON "SatzImportDraft"("batchId", "rowNumber");
