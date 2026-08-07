-- CreateTable
CREATE TABLE "GrammarTopic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetLang" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keywords" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GrammarBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "examples" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GrammarBlock_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "GrammarTopic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GrammarTopic_targetLang_category_sortOrder_idx" ON "GrammarTopic"("targetLang", "category", "sortOrder");

-- CreateIndex
CREATE INDEX "GrammarTopic_targetLang_sortOrder_idx" ON "GrammarTopic"("targetLang", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "GrammarTopic_targetLang_slug_key" ON "GrammarTopic"("targetLang", "slug");

-- CreateIndex
CREATE INDEX "GrammarBlock_topicId_sortOrder_idx" ON "GrammarBlock"("topicId", "sortOrder");

