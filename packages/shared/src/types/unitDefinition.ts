/**
 * Unit definition types for database records
 * These are configured in the dev page and linked from items
 */

import type { BlueprintQuality } from './enums.js';

export type UnitCategory = 'infantry' | 'combat_vehicle' | 'support_vehicle';
export type UnitAttackType = 'instant_laser' | 'laser_burst' | 'bullet' | 'missile';
export type UnitMeshPartFlag = 'base' | 'pitch' | 'yaw' | 'barrel';

/**
 * Barrel line position in local space relative to pitch mesh
 * Used to define laser origin point and direction
 */
export interface UnitBarrelLinePosition {
  x: number;
  y: number;
  z: number;
}

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

  // Attack type configuration
  attackType: UnitAttackType;
  laserColor: string | null; // Hex color like "#ff0000", null = default red
  projectileSpeed: number; // Units per second for non-instant attacks
  burstCount: number; // For laser_burst: number of shots
  burstInterval: number; // Seconds between burst shots
  barrelOffsetY: number; // DEPRECATED: Y offset from pivot to barrel centerline - use barrelLinePosition instead
  barrelMeshName: string | null; // Explicit barrel mesh name (overrides auto-detection)
  meshPartFlags: Record<string, UnitMeshPartFlag[]> | null; // Mesh part flags: {"meshName": ["base", "pitch", "yaw"]}
  barrelLinePosition: UnitBarrelLinePosition | null; // Barrel line local position relative to pitch mesh

  // Rotation clamps (degrees)
  yawClampMin: number; // Minimum yaw rotation (-180 to 180)
  yawClampMax: number; // Maximum yaw rotation (-180 to 180)
  pitchClampMin: number; // Minimum pitch rotation (-90 to 90)
  pitchClampMax: number; // Maximum pitch rotation (-90 to 90)

  // Category
  category: UnitCategory;

  // AI Behavior
  aiPresetId: string | null; // Reference to AI preset for behavior tree

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
  // Attack type configuration
  attackType?: UnitAttackType;
  laserColor?: string | null;
  projectileSpeed?: number;
  burstCount?: number;
  burstInterval?: number;
  barrelOffsetY?: number;
  barrelMeshName?: string | null;
  meshPartFlags?: Record<string, UnitMeshPartFlag[]> | null;
  barrelLinePosition?: UnitBarrelLinePosition | null;
  // Rotation clamps
  yawClampMin?: number;
  yawClampMax?: number;
  pitchClampMin?: number;
  pitchClampMax?: number;
  category?: UnitCategory;
  aiPresetId?: string | null;
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
