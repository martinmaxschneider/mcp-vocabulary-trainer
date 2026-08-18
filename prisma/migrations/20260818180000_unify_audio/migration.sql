-- AlterTable
ALTER TABLE "Entry" ADD COLUMN "mainAudioStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Entry" ADD COLUMN "mainAudioUrl" TEXT;
ALTER TABLE "Entry" ADD COLUMN "mainAudioDurationMs" INTEGER;

-- AlterTable
ALTER TABLE "Translation" ADD COLUMN "audioStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Translation" ADD COLUMN "audioDurationMs" INTEGER;

-- CreateTable
CREATE TABLE "ConjugationTenseAudio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "translationId" TEXT NOT NULL,
    "tenseKey" TEXT NOT NULL,
    "audioUrl" TEXT,
    "audioStatus" TEXT NOT NULL DEFAULT 'NONE',
    "audioDurationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConjugationTenseAudio_translationId_fkey" FOREIGN KEY ("translationId") REFERENCES "Translation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ConjugationTenseAudio_translationId_tenseKey_key" ON "ConjugationTenseAudio"("translationId", "tenseKey");
CREATE INDEX "ConjugationTenseAudio_audioStatus_idx" ON "ConjugationTenseAudio"("audioStatus");
