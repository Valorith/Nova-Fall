-- Add tileSize to UnitDefinition
ALTER TABLE "UnitDefinition" ADD COLUMN IF NOT EXISTS "tileSize" DOUBLE PRECISION NOT NULL DEFAULT 1;
