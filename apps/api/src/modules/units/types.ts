import type { UnitDefinition } from '@prisma/client';

export type UnitCategory = 'infantry' | 'combat_vehicle' | 'support_vehicle';
export type AttackType = 'instant_laser' | 'laser_burst' | 'bullet' | 'missile';
export type MeshPartFlag = 'base' | 'pitch' | 'yaw' | 'barrel';

export interface BarrelLinePosition {
  x: number;
  y: number;
  z: number;
}

export interface UnitDefinitionInput {
  name: string;
  description?: string | null;
  modelPath?: string | null;
  health?: number;
  shield?: number;
  shieldRange?: number;
  damage?: number;
  armor?: number;
  speed?: number;
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
  category?: UnitCategory;
  aiPresetId?: string | null;
}

export interface UnitDefinitionListQuery {
  category?: UnitCategory;
  search?: string;
  limit?: number;
  offset?: number;
}

export type { UnitDefinition };
