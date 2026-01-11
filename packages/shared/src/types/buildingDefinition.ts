/**
 * Building definition types for database records
 * These are configured in the dev page and linked from items
 */

import type { BlueprintQuality } from './enums.js';

export type BuildingCategory = 'turret' | 'wall' | 'structure' | 'utility';

/**
 * Building definition as stored in the database
 */
export interface DbBuildingDefinition {
  id: string;
  name: string;
  description: string | null;
  modelPath: string | null; // Path to 3D model (e.g., "/models/buildings/turret.glb")

  // Size (in tiles)
  width: number;
  height: number;

  // Base combat stats
  health: number;
  shield: number; // Shield hit points
  armor: number;

  // Combat capability (0 = non-combat building)
  damage: number;
  range: number; // Attack range in tiles
  attackSpeed: number; // Attacks per second

  // Category
  category: BuildingCategory;

  // Relations (item count for display)
  items?: { id: string; itemId: string; name: string; quality: BlueprintQuality }[];

  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating/updating building definitions
 */
export interface DbBuildingDefinitionInput {
  name: string;
  description?: string | null;
  modelPath?: string | null;
  width?: number;
  height?: number;
  health?: number;
  shield?: number;
  armor?: number;
  damage?: number;
  range?: number;
  attackSpeed?: number;
  category?: BuildingCategory;
}
