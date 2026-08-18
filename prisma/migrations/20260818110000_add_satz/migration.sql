-- CreateTable
CREATE TABLE "Satz" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mainLang" TEXT NOT NULL DEFAULT 'de',
    "mainText" TEXT NOT NULL,
    "trigger" TEXT,
    "source" TEXT NOT NULL DEFAULT 'PERSONAL',
    "priority" TEXT NOT NULL DEFAULT 'OCCASIONAL',
    "shadowingStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "answerToId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Satz_answerToId_fkey" FOREIGN KEY ("answerToId") REFERENCES "Satz" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SatzTranslation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "satzId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "audioUrl" TEXT,
    "audioStatus" TEXT NOT NULL DEFAULT 'NONE',
    "register" TEXT NOT NULL DEFAULT 'INFORMAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SatzTranslation_satzId_fkey" FOREIGN KEY ("satzId") REFERENCES "Satz" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DomainSatz" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "satzId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DomainSatz_satzId_fkey" FOREIGN KEY ("satzId") REFERENCES "Satz" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DomainSatz_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SatzEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "satzId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SatzEntry_satzId_fkey" FOREIGN KEY ("satzId") REFERENCES "Satz" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SatzEntry_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SatzGrammarTopic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "satzId" TEXT NOT NULL,
    "grammarTopicId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SatzGrammarTopic_satzId_fkey" FOREIGN KEY ("satzId") REFERENCES "Satz" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SatzGrammarTopic_grammarTopicId_fkey" FOREIGN KEY ("grammarTopicId") REFERENCES "GrammarTopic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Satz_answerToId_idx" ON "Satz"("answerToId");

-- CreateIndex
CREATE INDEX "Satz_updatedAt_idx" ON "Satz"("updatedAt");

-- CreateIndex
CREATE INDEX "Satz_source_priority_idx" ON "Satz"("source", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "SatzTranslation_satzId_lang_register_key" ON "SatzTranslation"("satzId", "lang", "register");

-- CreateIndex
CREATE INDEX "SatzTranslation_lang_idx" ON "SatzTranslation"("lang");

-- CreateIndex
CREATE INDEX "SatzTranslation_satzId_idx" ON "SatzTranslation"("satzId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainSatz_satzId_domainId_key" ON "DomainSatz"("satzId", "domainId");

-- CreateIndex
CREATE INDEX "DomainSatz_satzId_idx" ON "DomainSatz"("satzId");

-- CreateIndex
CREATE INDEX "DomainSatz_domainId_idx" ON "DomainSatz"("domainId");

-- CreateIndex
CREATE UNIQUE INDEX "SatzEntry_satzId_entryId_key" ON "SatzEntry"("satzId", "entryId");

-- CreateIndex
CREATE INDEX "SatzEntry_satzId_idx" ON "SatzEntry"("satzId");

-- CreateIndex
CREATE INDEX "SatzEntry_entryId_idx" ON "SatzEntry"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "SatzGrammarTopic_satzId_grammarTopicId_key" ON "SatzGrammarTopic"("satzId", "grammarTopicId");

-- CreateIndex
CREATE INDEX "SatzGrammarTopic_satzId_idx" ON "SatzGrammarTopic"("satzId");

-- CreateIndex
CREATE INDEX "SatzGrammarTopic_grammarTopicId_idx" ON "SatzGrammarTopic"("grammarTopicId");
