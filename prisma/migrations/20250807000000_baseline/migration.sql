-- CreateTable
CREATE TABLE "ConjugationForm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "translationId" TEXT NOT NULL,
    "tenseKey" TEXT NOT NULL,
    "personIndex" INTEGER NOT NULL,
    "form" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("translationId") REFERENCES "Translation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DomainEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "mainLang" TEXT NOT NULL DEFAULT 'de',
    "mainText" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PronunciationGuide" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nativeLang" TEXT NOT NULL,
    "targetLang" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PronunciationGuideItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guideId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "approx" TEXT,
    "explanation" TEXT NOT NULL,
    "exampleWord" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("guideId") REFERENCES "PronunciationGuide" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userProgressId" TEXT NOT NULL,
    "targetLang" TEXT NOT NULL,
    "userAnswer" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "typo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userProgressId") REFERENCES "UserProgress" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Translation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "regionTag" TEXT,
    "text" TEXT NOT NULL,
    "variants" JSONB,
    "example" TEXT,
    "ipa" TEXT,
    "audioUrl" TEXT,
    "isIrregular" BOOLEAN NOT NULL DEFAULT false,
    "conjugations" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL DEFAULT 'anonymous',
    "entryId" TEXT NOT NULL,
    "targetLang" TEXT NOT NULL DEFAULT 'en',
    "box" INTEGER NOT NULL DEFAULT 1,
    "nextReviewAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ConjugationForm_translationId_tenseKey_personIndex_key" ON "ConjugationForm"("translationId" ASC, "tenseKey" ASC, "personIndex" ASC);

-- CreateIndex
CREATE INDEX "ConjugationForm_translationId_tenseKey_idx" ON "ConjugationForm"("translationId" ASC, "tenseKey" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Domain_name_key" ON "Domain"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DomainEntry_entryId_domainId_key" ON "DomainEntry"("entryId" ASC, "domainId" ASC);

-- CreateIndex
CREATE INDEX "DomainEntry_domainId_idx" ON "DomainEntry"("domainId" ASC);

-- CreateIndex
CREATE INDEX "DomainEntry_entryId_idx" ON "DomainEntry"("entryId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PronunciationGuide_nativeLang_targetLang_key" ON "PronunciationGuide"("nativeLang" ASC, "targetLang" ASC);

-- CreateIndex
CREATE INDEX "PronunciationGuide_targetLang_idx" ON "PronunciationGuide"("targetLang" ASC);

-- CreateIndex
CREATE INDEX "PronunciationGuide_nativeLang_idx" ON "PronunciationGuide"("nativeLang" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PronunciationGuideItem_guideId_symbol_key" ON "PronunciationGuideItem"("guideId" ASC, "symbol" ASC);

-- CreateIndex
CREATE INDEX "PronunciationGuideItem_guideId_sortOrder_idx" ON "PronunciationGuideItem"("guideId" ASC, "sortOrder" ASC);

-- CreateIndex
CREATE INDEX "ReviewLog_createdAt_idx" ON "ReviewLog"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "ReviewLog_userProgressId_idx" ON "ReviewLog"("userProgressId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Translation_entryId_lang_regionTag_key" ON "Translation"("entryId" ASC, "lang" ASC, "regionTag" ASC);

-- CreateIndex
CREATE INDEX "Translation_lang_isIrregular_idx" ON "Translation"("lang" ASC, "isIrregular" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserProgress_userId_entryId_targetLang_key" ON "UserProgress"("userId" ASC, "entryId" ASC, "targetLang" ASC);

-- CreateIndex
CREATE INDEX "UserProgress_userId_nextReviewAt_idx" ON "UserProgress"("userId" ASC, "nextReviewAt" ASC);

-- CreateIndex
CREATE INDEX "UserProgress_userId_targetLang_nextReviewAt_idx" ON "UserProgress"("userId" ASC, "targetLang" ASC, "nextReviewAt" ASC);

-- CreateIndex
CREATE INDEX "UserProgress_userId_targetLang_box_idx" ON "UserProgress"("userId" ASC, "targetLang" ASC, "box" ASC);

