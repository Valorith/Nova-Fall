-- AlterTable
ALTER TABLE "Node" ADD COLUMN     "installedCoreId" TEXT;

-- CreateIndex
CREATE INDEX "Node_installedCoreId_idx" ON "Node"("installedCoreId");
