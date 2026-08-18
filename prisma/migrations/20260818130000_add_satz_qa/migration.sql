-- AlterTable
ALTER TABLE "SatzImportDraft" ADD COLUMN "isAnswer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SatzImportDraft" ADD COLUMN "answerToId" TEXT;
ALTER TABLE "SatzImportDraft" ADD COLUMN "suggestedQuestionText" TEXT;
ALTER TABLE "SatzImportDraft" ADD COLUMN "questionTranslations" JSONB;
ALTER TABLE "SatzImportDraft" ADD COLUMN "questionCandidates" JSONB;
