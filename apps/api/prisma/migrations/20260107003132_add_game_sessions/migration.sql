-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('KING_OF_THE_HILL', 'DOMINATION');

-- CreateEnum
CREATE TYPE "GameSessionStatus" AS ENUM ('LOBBY', 'ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "SessionRole" AS ENUM ('PLAYER', 'SPECTATOR');

-- AlterTable
ALTER TABLE "Node" ADD COLUMN     "gameSessionId" TEXT;

-- CreateTable
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gameType" "GameType" NOT NULL DEFAULT 'KING_OF_THE_HILL',
    "status" "GameSessionStatus" NOT NULL DEFAULT 'LOBBY',
    "minPlayers" INTEGER NOT NULL DEFAULT 2,
    "creatorId" TEXT NOT NULL,
    "crownNodeId" TEXT,
    "crownHeldSince" TIMESTAMP(3),
    "crownHolderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "winnerId" TEXT,

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSessionPlayer" (
    "id" TEXT NOT NULL,
    "gameSessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "role" "SessionRole" NOT NULL DEFAULT 'PLAYER',
    "resources" JSONB NOT NULL DEFAULT '{"credits": 1000, "iron": 100, "energy": 50}',
    "hqNodeId" TEXT,
    "totalNodes" INTEGER NOT NULL DEFAULT 0,
    "eliminatedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameSessionPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameSession_status_idx" ON "GameSession"("status");

-- CreateIndex
CREATE INDEX "GameSession_gameType_idx" ON "GameSession"("gameType");

-- CreateIndex
CREATE INDEX "GameSession_creatorId_idx" ON "GameSession"("creatorId");

-- CreateIndex
CREATE INDEX "GameSessionPlayer_gameSessionId_idx" ON "GameSessionPlayer"("gameSessionId");

-- CreateIndex
CREATE INDEX "GameSessionPlayer_playerId_idx" ON "GameSessionPlayer"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "GameSessionPlayer_gameSessionId_playerId_key" ON "GameSessionPlayer"("gameSessionId", "playerId");

-- CreateIndex
CREATE INDEX "Node_gameSessionId_idx" ON "Node"("gameSessionId");

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSessionPlayer" ADD CONSTRAINT "GameSessionPlayer_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSessionPlayer" ADD CONSTRAINT "GameSessionPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
