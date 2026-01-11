import type { UnitDefinition } from '@prisma/client';

export type UnitCategory = 'infantry' | 'combat_vehicle' | 'support_vehicle';

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
  category?: UnitCategory;
}

export interface UnitDefinitionListQuery {
  category?: UnitCategory;
  search?: string;
  limit?: number;
  offset?: number;
}

export type { UnitDefinition };
