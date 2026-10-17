-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "avatarEmoji" TEXT NOT NULL DEFAULT '🐶',
    "color" TEXT NOT NULL DEFAULT '#0d9488',
    "reconnectToken" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "kicked" BOOLEAN NOT NULL DEFAULT false,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Player_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Player" ("connected", "id", "joinedAt", "kicked", "nickname", "reconnectToken", "score", "sessionId", "streak") SELECT "connected", "id", "joinedAt", "kicked", "nickname", "reconnectToken", "score", "sessionId", "streak" FROM "Player";
DROP TABLE "Player";
ALTER TABLE "new_Player" RENAME TO "Player";
CREATE UNIQUE INDEX "Player_reconnectToken_key" ON "Player"("reconnectToken");
CREATE INDEX "Player_sessionId_idx" ON "Player"("sessionId");
CREATE UNIQUE INDEX "Player_sessionId_nickname_key" ON "Player"("sessionId", "nickname");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
