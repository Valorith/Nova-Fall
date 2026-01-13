-- CreateTable: AIPreset
CREATE TABLE "AIPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "treeData" JSONB NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIPreset_pkey" PRIMARY KEY ("id")
);

-- Add aiPresetId to UnitDefinition
ALTER TABLE "UnitDefinition" ADD COLUMN "aiPresetId" TEXT;

-- Add aiPresetId to BuildingDefinition
ALTER TABLE "BuildingDefinition" ADD COLUMN "aiPresetId" TEXT;

-- AddForeignKey: UnitDefinition -> AIPreset
ALTER TABLE "UnitDefinition" ADD CONSTRAINT "UnitDefinition_aiPresetId_fkey" FOREIGN KEY ("aiPresetId") REFERENCES "AIPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: BuildingDefinition -> AIPreset
ALTER TABLE "BuildingDefinition" ADD CONSTRAINT "BuildingDefinition_aiPresetId_fkey" FOREIGN KEY ("aiPresetId") REFERENCES "AIPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: AIPreset.category
CREATE INDEX "AIPreset_category_idx" ON "AIPreset"("category");

-- CreateIndex: AIPreset.isTemplate
CREATE INDEX "AIPreset_isTemplate_idx" ON "AIPreset"("isTemplate");

-- CreateIndex: UnitDefinition.aiPresetId
CREATE INDEX "UnitDefinition_aiPresetId_idx" ON "UnitDefinition"("aiPresetId");

-- CreateIndex: BuildingDefinition.aiPresetId
CREATE INDEX "BuildingDefinition_aiPresetId_idx" ON "BuildingDefinition"("aiPresetId");
