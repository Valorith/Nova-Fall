import { BlueprintCategory, BlueprintQuality, NodeType } from './enums.js';

// Material input/output for crafting
export interface BlueprintMaterial {
  itemId: string;
  quantity: number;
}

// Full blueprint definition
export interface Blueprint {
  id: string;
  name: string;
  description: string | null;

  // Classification
  category: BlueprintCategory;
  quality: BlueprintQuality;

  // Learning requirement
  // false = known by default (all players can craft)
  // true = must be learned via blueprint item consumption
  learned: boolean;

  // Crafting requirements
  craftTime: number; // Seconds
  nodeTypes: NodeType[]; // Where this can be crafted
  nodeTierRequired: number;

  // Inputs and outputs
  inputs: BlueprintMaterial[];
  outputs: BlueprintMaterial[];

  // Visual
  icon: string | null;

  // Metadata
  createdAt: string;
  updatedAt: string;
}

// Create/update blueprint payload (without id, timestamps)
export interface BlueprintInput {
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

// Blueprint list item (for display in lists)
export interface BlueprintListItem {
  id: string;
  name: string;
  category: BlueprintCategory;
  quality: BlueprintQuality;
  learned: boolean;
  craftTime: number;
  nodeTypes: NodeType[];
}

// Player's available blueprints (includes learned status)
export interface PlayerBlueprint extends Blueprint {
  canCraft: boolean; // Whether player can craft this (learned check passed)
}
