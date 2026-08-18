-- AlterTable
ALTER TABLE "Satz" ADD COLUMN "mainAudioDurationMs" INTEGER;

-- AlterTable
ALTER TABLE "SatzTranslation" ADD COLUMN "audioDurationMs" INTEGER;
