import type { ItemCategory, NodeType, BlueprintQuality } from '@prisma/client';

export interface ItemDefinitionInput {
  itemId: string;
  name: string;
  description?: string | null;
  category: ItemCategory;
  quality?: BlueprintQuality;
  icon?: string | null;
  color?: string;
  stackSize?: number;
  targetNodeType?: NodeType | null;
  coreCost?: number | null;
  efficiency?: number;
  isTradeable?: boolean;
  buyPrice?: number | null;
  sellPrice?: number | null;
  productionRates?: Record<string, number> | null;
  isBlueprint?: boolean;
  linkedBlueprintId?: string | null;
}

export interface ItemDefinitionListQuery {
  category?: ItemCategory;
  isTradeable?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}
