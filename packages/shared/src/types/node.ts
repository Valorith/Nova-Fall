import { NodeType, NodeStatus, RoadType } from './enums';

// Resource types available in the game
export type ResourceType = 'credits' | 'iron' | 'energy' | 'alloys' | 'crystals';

// Resources stored in a node
export interface NodeResources {
  credits: number;
  iron: number;
  energy: number;
  alloys?: number;
  crystals?: number;
}

// Node data for map display (minimal data for rendering)
export interface MapNode {
  id: string;
  name: string;
  type: NodeType;
  tier: number;
  positionX: number;
  positionY: number;
  regionId: string | null;
  ownerId: string | null;
  ownerName?: string;
  status: NodeStatus;
}

// Full node data (includes storage, buildings count, etc.)
export interface NodeDetail extends MapNode {
  storage: NodeResources;
  claimedAt: string | null;
  upkeepDue: string | null;
  buildingCount: number;
  garrisonCount: number;
  attackCooldownUntil: string | null;
  attackImmunityUntil: string | null;
  connections: NodeConnectionInfo[];
}

// Node connection info
export interface NodeConnectionInfo {
  id: string;
  toNodeId: string;
  toNodeName: string;
  toNodeType: NodeType;
  toNodeOwnerId: string | null;
  distance: number;
  dangerLevel: number;
  roadType: RoadType;
}

// Node type configuration (bonuses, base resources, etc.)
export interface NodeTypeConfig {
  type: NodeType;
  displayName: string;
  description: string;
  baseUpkeep: number;
  resourceBonuses: Partial<Record<ResourceType, number>>;
  buildingSlots: number;
  defaultResources: NodeResources;
  claimCost: NodeResources;
  color: string; // Hex color for map rendering
  icon: string; // Icon identifier
}
