import type { BuildingDefinition } from '@prisma/client';

export type BuildingCategory = 'turret' | 'wall' | 'structure' | 'utility';
export type AttackType = 'instant_laser' | 'laser_burst' | 'bullet' | 'missile';
export type MeshPartFlag = 'base' | 'pitch' | 'yaw' | 'barrel';

export interface BarrelLinePosition {
  x: number;
  y: number;
  z: number;
}

export interface BuildingDefinitionInput {
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

export interface BuildingDefinitionListQuery {
  category?: BuildingCategory;
  search?: string;
  limit?: number;
  offset?: number;
}

export type { BuildingDefinition };
