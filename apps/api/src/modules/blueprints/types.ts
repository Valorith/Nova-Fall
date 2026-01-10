import type { BlueprintCategory, BlueprintQuality, NodeType } from '@nova-fall/shared';

// Material input/output for crafting
export interface BlueprintMaterial {
  itemId: string;
  quantity: number;
}

// Create blueprint request body
export interface CreateBlueprintRequest {
  name: string;
  description?: string | null;
  category: BlueprintCategory;
  quality: BlueprintQuality;
  learned: boolean;
  craftTime: number;
  nodeTypes: NodeType[];
  nodeTierRequired: number;
  inputs: BlueprintMaterial[];
  outputs: BlueprintMaterial[];
  icon?: string | null;
}

// Update blueprint request body (all fields optional)
export interface UpdateBlueprintRequest {
  name?: string;
  description?: string | null;
  category?: BlueprintCategory;
  quality?: BlueprintQuality;
  learned?: boolean;
  craftTime?: number;
  nodeTypes?: NodeType[];
  nodeTierRequired?: number;
  inputs?: BlueprintMaterial[];
  outputs?: BlueprintMaterial[];
  icon?: string | null;
}

// List blueprints query params
export interface ListBlueprintsQuery {
  category?: BlueprintCategory;
  quality?: BlueprintQuality;
  learned?: 'true' | 'false';
  search?: string;
  limit?: number;
  offset?: number;
}

// Blueprint response (from database)
export interface BlueprintResponse {
  id: string;
  name: string;
  description: string | null;
  category: BlueprintCategory;
  quality: BlueprintQuality;
  learned: boolean;
  craftTime: number;
  nodeTypes: NodeType[];
  nodeTierRequired: number;
  inputs: BlueprintMaterial[];
  outputs: BlueprintMaterial[];
  icon: string | null;
  createdAt: string;
  updatedAt: string;
}

// Paginated list response
export interface BlueprintListResponse {
  blueprints: BlueprintResponse[];
  total: number;
  limit: number;
  offset: number;
}
