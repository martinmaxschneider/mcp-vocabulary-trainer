-- CreateTable
CREATE TABLE "MediaWork" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleKey" TEXT NOT NULL,
    "creator" TEXT,
    "year" INTEGER,
    "url" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaWork_kind_titleKey_key" ON "MediaWork"("kind", "titleKey");

-- CreateIndex
CREATE INDEX "MediaWork_kind_idx" ON "MediaWork"("kind");

-- AlterTable
ALTER TABLE "Satz" ADD COLUMN "mediaWorkId" TEXT;

-- CreateIndex
CREATE INDEX "Satz_mediaWorkId_idx" ON "Satz"("mediaWorkId");

-- AlterTable
ALTER TABLE "SatzImportDraft" ADD COLUMN "mediaWorkId" TEXT;

-- CreateIndex
CREATE INDEX "SatzImportDraft_mediaWorkId_idx" ON "SatzImportDraft"("mediaWorkId");
