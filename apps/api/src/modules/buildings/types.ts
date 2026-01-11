import type { BuildingDefinition } from '@prisma/client';

export type BuildingCategory = 'turret' | 'wall' | 'structure' | 'utility';

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
  category?: BuildingCategory;
}

export interface BuildingDefinitionListQuery {
  category?: BuildingCategory;
  search?: string;
  limit?: number;
  offset?: number;
}

export type { BuildingDefinition };
