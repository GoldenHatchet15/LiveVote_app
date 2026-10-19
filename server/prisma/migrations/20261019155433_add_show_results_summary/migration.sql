-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_QuestionSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "showVoterNames" BOOLEAN NOT NULL DEFAULT false,
    "showResultsSummary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_QuestionSet" ("createdAt", "description", "id", "showVoterNames", "title", "updatedAt") SELECT "createdAt", "description", "id", "showVoterNames", "title", "updatedAt" FROM "QuestionSet";
DROP TABLE "QuestionSet";
ALTER TABLE "new_QuestionSet" RENAME TO "QuestionSet";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
