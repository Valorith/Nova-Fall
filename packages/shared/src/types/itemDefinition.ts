import type { NodeType, BlueprintQuality } from './enums.js';
import type { DbUnitDefinition } from './unitDefinition.js';
import type { DbBuildingDefinition } from './buildingDefinition.js';

// Item definition as stored in the database (database model)
// Named DbItemDefinition to avoid conflict with the hardcoded ItemDefinition in config/items.ts
export interface DbItemDefinition {
  id: string;
  itemId: string; // Unique identifier (e.g., "iron", "solar_farm")
  name: string;
  description: string | null;
  category: string; // DbItemCategory enum value
  quality: BlueprintQuality; // Quality level (shared with blueprints)
  icon: string | null;
  color: string;
  stackSize: number;
  targetNodeType: NodeType | null; // For node cores
  hqCost: number | null; // Credits to purchase from HQ (any item type)
  efficiency: number; // 1-5: bonus per point above 1 (+10% production/speed, -10% trade fee)
  isTradeable: boolean;
  buyPrice: number | null;
  sellPrice: number | null;
  productionRates: Record<string, number> | null; // Node type -> hourly rate
  isBlueprint: boolean; // Flag indicating this item is a craftable blueprint
  linkedBlueprintId: string | null; // Reference to the Blueprint this item represents

  // Links to Unit/Building definitions
  unitDefinitionId: string | null;
  unitDefinition: DbUnitDefinition | null;
  buildingDefinitionId: string | null;
  buildingDefinition: DbBuildingDefinition | null;

  createdAt: string;
  updatedAt: string;
}

// Input for creating/updating item definitions
export interface DbItemDefinitionInput {
  itemId: string;
  name: string;
  description?: string | null;
  category: string; // DbItemCategory enum value
  quality?: BlueprintQuality; // Quality level
  icon?: string | null;
  color?: string;
  stackSize?: number;
  targetNodeType?: NodeType | null;
  hqCost?: number | null;
  efficiency?: number; // 1-5
  isTradeable?: boolean;
  buyPrice?: number | null;
  sellPrice?: number | null;
  productionRates?: Record<string, number> | null;
  isBlueprint?: boolean;
  linkedBlueprintId?: string | null;
  unitDefinitionId?: string | null;
  buildingDefinitionId?: string | null;
}

