/**
 * Unit definition types for database records
 * These are configured in the dev page and linked from items
 */

import type { BlueprintQuality } from './enums.js';

export type UnitCategory = 'infantry' | 'combat_vehicle' | 'support_vehicle';

/**
 * Unit definition as stored in the database
 */
export interface DbUnitDefinition {
  id: string;
  name: string;
  description: string | null;
  modelPath: string | null; // Path to 3D model (e.g., "/models/units/marine.glb")

  // Size (in tiles)
  tileSize: number; // Size of unit in tiles (default: 1)

  // Base combat stats
  health: number;
  shield: number; // Shield hit points (absorbs damage before health)
  shieldRange: number; // 0 = personal shield, >0 = AOE radius protecting nearby allies
  damage: number;
  armor: number;
  speed: number; // Movement speed (tiles per minute)
  range: number; // Attack range in tiles
  attackSpeed: number; // Attacks per second

  // Category
  category: UnitCategory;

  // Relations (item count for display)
  items?: { id: string; itemId: string; name: string; quality: BlueprintQuality }[];

  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating/updating unit definitions
 */
export interface DbUnitDefinitionInput {
  name: string;
  description?: string | null;
  modelPath?: string | null;
  tileSize?: number;
  health?: number;
  shield?: number;
  shieldRange?: number;
  damage?: number;
  armor?: number;
  speed?: number;
  range?: number;
  attackSpeed?: number;
  category?: UnitCategory;
}

/**
 * Quality bonus multipliers for unit stats at runtime
 * Applied during combat, not stored in definition
 */
export const QUALITY_STAT_MULTIPLIERS: Record<string, number> = {
  COMMON: 1.0,
  UNCOMMON: 1.05,
  RARE: 1.1,
  EPIC: 1.2,
  LEGENDARY: 1.35,
};

/**
 * Calculate unit stats with quality bonus
 */
export function applyQualityBonus(
  baseStats: { health: number; shield: number; damage: number; armor: number },
  quality: string
): { health: number; shield: number; damage: number; armor: number } {
  const multiplier = QUALITY_STAT_MULTIPLIERS[quality] ?? 1.0;
  return {
    health: Math.floor(baseStats.health * multiplier),
    shield: Math.floor(baseStats.shield * multiplier),
    damage: Math.floor(baseStats.damage * multiplier),
    armor: Math.floor(baseStats.armor * multiplier),
  };
}
