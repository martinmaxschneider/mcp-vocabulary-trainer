-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WorksheetAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "userAnswer" JSONB NOT NULL,
    "autoCorrect" BOOLEAN NOT NULL,
    "isTypo" BOOLEAN NOT NULL DEFAULT false,
    "manualOverride" BOOLEAN,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overriddenAt" DATETIME,
    CONSTRAINT "WorksheetAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "WorksheetQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WorksheetAnswer" ("id", "questionId", "userAnswer", "autoCorrect", "isTypo", "manualOverride", "checkedAt", "overriddenAt")
SELECT "id", "questionId", "userAnswer", "autoCorrect", "isTypo", CASE WHEN "manuallyMarkedCorrect" = 1 THEN 1 ELSE NULL END, "checkedAt", "overriddenAt"
FROM "WorksheetAnswer";
DROP TABLE "WorksheetAnswer";
ALTER TABLE "new_WorksheetAnswer" RENAME TO "WorksheetAnswer";
CREATE UNIQUE INDEX "WorksheetAnswer_questionId_key" ON "WorksheetAnswer"("questionId");
CREATE INDEX "WorksheetAnswer_questionId_idx" ON "WorksheetAnswer"("questionId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
