-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('RESOURCE', 'NODE_CORE', 'CONSUMABLE', 'EQUIPMENT', 'CRAFTED');

-- CreateTable
CREATE TABLE "ItemDefinition" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "ItemCategory" NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "icon" TEXT,
    "color" TEXT NOT NULL DEFAULT '#888888',
    "stackSize" INTEGER NOT NULL DEFAULT 1000,
    "targetNodeType" "NodeType",
    "coreCost" INTEGER,
    "isTradeable" BOOLEAN NOT NULL DEFAULT false,
    "buyPrice" INTEGER,
    "sellPrice" INTEGER,
    "productionRates" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemDefinition_itemId_key" ON "ItemDefinition"("itemId");

-- CreateIndex
CREATE INDEX "ItemDefinition_category_idx" ON "ItemDefinition"("category");

-- CreateIndex
CREATE INDEX "ItemDefinition_itemId_idx" ON "ItemDefinition"("itemId");

-- CreateIndex
CREATE INDEX "ItemDefinition_isTradeable_idx" ON "ItemDefinition"("isTradeable");
