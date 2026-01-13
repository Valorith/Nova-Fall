import type { BehaviorTree } from '@nova-fall/shared';

export type AIPresetCategory = 'unit' | 'building';

export interface AIPresetInput {
  name: string;
  description?: string | null;
  category: AIPresetCategory;
  treeData: BehaviorTree;
  isTemplate?: boolean;
}

export interface AIPresetListQuery {
  category?: AIPresetCategory;
  includeTemplates?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}
