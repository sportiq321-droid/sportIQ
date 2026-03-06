/*
  Warnings:

  - A unique constraint covering the columns `[matchId,playerId]` on the table `PlayerMatchStats` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN "district" TEXT;
ALTER TABLE "User" ADD COLUMN "state" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerMatchStats_matchId_playerId_key" ON "PlayerMatchStats"("matchId", "playerId");
