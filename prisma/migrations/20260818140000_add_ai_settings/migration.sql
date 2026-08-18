-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatModel" TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
    "embeddingModel" TEXT NOT NULL DEFAULT 'openai/text-embedding-3-small',
    "ttsModel" TEXT NOT NULL DEFAULT 'openai/tts-1-hd',
    "ttsVoiceQuestion" TEXT NOT NULL DEFAULT 'onyx',
    "ttsVoiceAnswer" TEXT NOT NULL DEFAULT 'nova',
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "AppSettings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "generationId" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "characters" INTEGER,
    "costUsd" REAL,
    "status" TEXT NOT NULL,
    "error" TEXT
);

CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");
CREATE INDEX "AiUsageLog_kind_idx" ON "AiUsageLog"("kind");
