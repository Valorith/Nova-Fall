import type { BuildingDefinition } from '@prisma/client';

export type BuildingCategory = 'turret' | 'wall' | 'structure' | 'utility';
export type AttackType = 'instant_laser' | 'laser_burst' | 'bullet' | 'missile';

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
