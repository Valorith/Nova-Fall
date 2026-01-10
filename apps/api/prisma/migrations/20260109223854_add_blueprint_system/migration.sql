-- CreateEnum
CREATE TYPE "BlueprintQuality" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "BlueprintCategory" AS ENUM ('MECHANICAL', 'BIOLOGICAL', 'REFINEMENT', 'FOOD', 'ENHANCEMENTS', 'BUILDINGS', 'EQUIPMENT');

-- AlterTable
ALTER TABLE "GameSessionPlayer" ADD COLUMN     "learnedBlueprints" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "Blueprint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "BlueprintCategory" NOT NULL,
    "quality" "BlueprintQuality" NOT NULL DEFAULT 'COMMON',
    "learned" BOOLEAN NOT NULL DEFAULT false,
    "craftTime" INTEGER NOT NULL DEFAULT 60,
    "nodeTypes" JSONB NOT NULL,
    "nodeTierRequired" INTEGER NOT NULL DEFAULT 1,
    "inputs" JSONB NOT NULL,
    "outputs" JSONB NOT NULL,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Blueprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Blueprint_category_idx" ON "Blueprint"("category");

-- CreateIndex
CREATE INDEX "Blueprint_quality_idx" ON "Blueprint"("quality");

-- CreateIndex
CREATE INDEX "Blueprint_learned_idx" ON "Blueprint"("learned");

-- CreateIndex
CREATE INDEX "Blueprint_category_quality_idx" ON "Blueprint"("category", "quality");
