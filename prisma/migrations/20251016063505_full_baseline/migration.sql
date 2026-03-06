/*
  Warnings:

  - Added the required column `updatedAt` to the `TournamentRegistration` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "drill" TEXT NOT NULL,
    "rawMetrics" JSONB NOT NULL,
    "score" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "confidence" REAL,
    "status" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Assessment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TournamentRegistration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "regStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "regDecisionAt" DATETIME,
    "regDecisionBy" TEXT,
    "regDecisionReason" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TournamentRegistration_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TournamentRegistration_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TournamentRegistration" ("id", "playerId", "regStatus", "registeredAt", "tournamentId") SELECT "id", "playerId", "regStatus", "registeredAt", "tournamentId" FROM "TournamentRegistration";
DROP TABLE "TournamentRegistration";
ALTER TABLE "new_TournamentRegistration" RENAME TO "TournamentRegistration";
CREATE UNIQUE INDEX "TournamentRegistration_tournamentId_playerId_key" ON "TournamentRegistration"("tournamentId", "playerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Assessment_userId_idx" ON "Assessment"("userId");

-- CreateIndex
CREATE INDEX "Assessment_status_idx" ON "Assessment"("status");
