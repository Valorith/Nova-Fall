-- AlterTable
ALTER TABLE "ItemDefinition" ADD COLUMN     "quality" "BlueprintQuality" NOT NULL DEFAULT 'COMMON';

-- CreateIndex
CREATE INDEX "ItemDefinition_quality_idx" ON "ItemDefinition"("quality");
