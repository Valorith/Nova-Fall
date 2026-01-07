-- CreateEnum
CREATE TYPE "BotDifficulty" AS ENUM ('EASY', 'NORMAL', 'HARD');

-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "maxPlayers" INTEGER NOT NULL DEFAULT 8;

-- AlterTable
ALTER TABLE "GameSessionPlayer" ADD COLUMN     "botDifficulty" "BotDifficulty",
ADD COLUMN     "botName" TEXT,
ADD COLUMN     "isBot" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "playerId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "GameSessionPlayer_isBot_idx" ON "GameSessionPlayer"("isBot");
