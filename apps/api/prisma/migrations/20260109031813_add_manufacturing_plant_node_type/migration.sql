-- AlterEnum
ALTER TYPE "NodeType" ADD VALUE 'MANUFACTURING_PLANT';

-- DropIndex
DROP INDEX "ResourceTransfer_completesAt_idx";

-- DropIndex
DROP INDEX "ResourceTransfer_status_idx";

-- AlterTable
ALTER TABLE "GameSessionPlayer" ALTER COLUMN "resources" SET DEFAULT '{"credits": 1000}';

-- CreateIndex
CREATE INDEX "ResourceTransfer_status_completesAt_idx" ON "ResourceTransfer"("status", "completesAt");
