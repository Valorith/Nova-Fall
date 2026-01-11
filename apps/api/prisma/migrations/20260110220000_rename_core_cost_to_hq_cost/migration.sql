-- Rename coreCost to hqCost to support HQ shop purchases for all item types
ALTER TABLE "ItemDefinition" RENAME COLUMN "coreCost" TO "hqCost";
