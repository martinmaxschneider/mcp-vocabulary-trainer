-- CreateTable
CREATE TABLE "Worksheet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetLang" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "section" TEXT NOT NULL,
    "maxScore" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorksheetQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worksheetId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "categoryLabel" TEXT,
    "prompt" TEXT NOT NULL,
    "hint" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "accepted" JSONB NOT NULL,
    "explanation" TEXT,
    "grammarTopicId" TEXT,
    "entryId" TEXT,
    "tags" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorksheetQuestion_worksheetId_fkey" FOREIGN KEY ("worksheetId") REFERENCES "Worksheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorksheetQuestion_grammarTopicId_fkey" FOREIGN KEY ("grammarTopicId") REFERENCES "GrammarTopic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorksheetQuestion_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorksheetAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "userAnswer" JSONB NOT NULL,
    "autoCorrect" BOOLEAN NOT NULL,
    "isTypo" BOOLEAN NOT NULL DEFAULT false,
    "manuallyMarkedCorrect" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overriddenAt" DATETIME,
    CONSTRAINT "WorksheetAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "WorksheetQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Worksheet_targetLang_status_idx" ON "Worksheet"("targetLang", "status");

-- CreateIndex
CREATE INDEX "Worksheet_createdAt_idx" ON "Worksheet"("createdAt");

-- CreateIndex
CREATE INDEX "WorksheetQuestion_worksheetId_sortOrder_idx" ON "WorksheetQuestion"("worksheetId", "sortOrder");

-- CreateIndex
CREATE INDEX "WorksheetQuestion_grammarTopicId_idx" ON "WorksheetQuestion"("grammarTopicId");

-- CreateIndex
CREATE INDEX "WorksheetQuestion_entryId_idx" ON "WorksheetQuestion"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "WorksheetAnswer_questionId_key" ON "WorksheetAnswer"("questionId");

-- CreateIndex
CREATE INDEX "WorksheetAnswer_questionId_idx" ON "WorksheetAnswer"("questionId");
