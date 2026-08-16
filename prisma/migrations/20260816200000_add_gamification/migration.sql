-- CreateTable
CREATE TABLE "DailyActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL DEFAULT 'anonymous',
    "date" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "answersCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "byLang" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UnlockedAchievement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL DEFAULT 'anonymous',
    "key" TEXT NOT NULL,
    "unlockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetLang" TEXT,
    "meta" JSONB
);

-- CreateTable
CREATE TABLE "GamificationSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL DEFAULT 'anonymous',
    "dailyGoalXp" INTEGER NOT NULL DEFAULT 50,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyActivity_userId_date_key" ON "DailyActivity"("userId", "date");

-- CreateIndex
CREATE INDEX "DailyActivity_userId_date_idx" ON "DailyActivity"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "UnlockedAchievement_userId_key_key" ON "UnlockedAchievement"("userId", "key");

-- CreateIndex
CREATE INDEX "UnlockedAchievement_userId_idx" ON "UnlockedAchievement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GamificationSettings_userId_key" ON "GamificationSettings"("userId");
