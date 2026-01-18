/**
 * Building definition types for database records
 * These are configured in the dev page and linked from items
 */

import type { BlueprintQuality } from './enums.js';

export type BuildingCategory = 'turret' | 'wall' | 'structure' | 'utility';
export type MeshPartFlag = 'base' | 'pitch' | 'yaw' | 'barrel';

/**
 * Barrel line position in local space relative to pitch mesh
 * Used to define laser origin point and direction
 */
export interface BarrelLinePosition {
  x: number;
  y: number;
  z: number;
}

/**
 * Building definition as stored in the database
 */
export type AttackType = 'instant_laser' | 'laser_burst' | 'bullet' | 'missile';

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

  // Attack type configuration
  attackType: AttackType;
  laserColor: string | null; // Hex color like "#ff0000", null = default red
  projectileSpeed: number; // Units per second for non-instant attacks
  burstCount: number; // For laser_burst: number of shots
  burstInterval: number; // Seconds between burst shots
  barrelOffsetY: number; // DEPRECATED: Y offset from turret pivot to barrel centerline - use barrelLinePosition instead
  barrelMeshName: string | null; // Explicit barrel mesh name (overrides auto-detection)
  meshPartFlags: Record<string, MeshPartFlag[]> | null; // Mesh part flags: {"meshName": ["base", "pitch", "yaw"]}
  barrelLinePosition: BarrelLinePosition | null; // Barrel line local position relative to pitch mesh

  // Rotation clamps (degrees)
  yawClampMin: number; // Minimum yaw rotation (-180 to 180)
  yawClampMax: number; // Maximum yaw rotation (-180 to 180)
  pitchClampMin: number; // Minimum pitch rotation (-90 to 90)
  pitchClampMax: number; // Maximum pitch rotation (-90 to 90)

  // Category
  category: BuildingCategory;

  // AI Behavior
  aiPresetId: string | null; // Reference to AI preset for behavior tree

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
  // Attack type configuration
  attackType?: AttackType;
  laserColor?: string | null;
  projectileSpeed?: number;
  burstCount?: number;
  burstInterval?: number;
  barrelOffsetY?: number;
  barrelMeshName?: string | null;
  meshPartFlags?: Record<string, MeshPartFlag[]> | null;
  barrelLinePosition?: BarrelLinePosition | null;
  // Rotation clamps
  yawClampMin?: number;
  yawClampMax?: number;
  pitchClampMin?: number;
  pitchClampMax?: number;
  category?: BuildingCategory;
  aiPresetId?: string | null;
}
