-- AlterTable
ALTER TABLE "Player" ADD COLUMN "hqNodeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Player_hqNodeId_key" ON "Player"("hqNodeId");
