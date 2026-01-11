-- Add UNIT to ItemCategory enum
ALTER TYPE "ItemCategory" ADD VALUE 'UNIT';

-- Add UNIT to BlueprintCategory enum
ALTER TYPE "BlueprintCategory" ADD VALUE 'UNIT';

-- Add unitStats JSON field to ItemDefinition
ALTER TABLE "ItemDefinition" ADD COLUMN "unitStats" JSONB;
