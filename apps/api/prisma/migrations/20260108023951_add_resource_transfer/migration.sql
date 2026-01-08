-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ResourceTransfer" (
    "id" TEXT NOT NULL,
    "gameSessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "destNodeId" TEXT NOT NULL,
    "resources" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completesAt" TIMESTAMP(3) NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "ResourceTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResourceTransfer_gameSessionId_idx" ON "ResourceTransfer"("gameSessionId");

-- CreateIndex
CREATE INDEX "ResourceTransfer_playerId_idx" ON "ResourceTransfer"("playerId");

-- CreateIndex
CREATE INDEX "ResourceTransfer_sourceNodeId_idx" ON "ResourceTransfer"("sourceNodeId");

-- CreateIndex
CREATE INDEX "ResourceTransfer_destNodeId_idx" ON "ResourceTransfer"("destNodeId");

-- CreateIndex
CREATE INDEX "ResourceTransfer_status_idx" ON "ResourceTransfer"("status");

-- CreateIndex
CREATE INDEX "ResourceTransfer_completesAt_idx" ON "ResourceTransfer"("completesAt");
