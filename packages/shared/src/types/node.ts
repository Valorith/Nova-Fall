import type { NodeType, NodeStatus, RoadType, UpkeepStatus } from './enums.js';
import type { ResourceType as RT, ResourceStorage } from '../config/resources.js';

// Re-export ResourceType from config for backwards compatibility
export type { ResourceType, ResourceStorage } from '../config/resources.js';

// Resources stored in a node (using ResourceStorage from config)
export type NodeResources = ResourceStorage;

// Local alias for use within this file
type ResourceType = RT;

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
  isHQ?: boolean; // True if this is the owner's headquarters
  isCrown?: boolean; // True if this is the crown node for KOTH games
  upkeepStatus?: UpkeepStatus; // Current upkeep payment status
  claimedAt?: string | null; // When the node was claimed (used for crown countdown)
  storage?: NodeResources; // Resources stored in the node
  installedCoreId?: string | null; // Installed node core (activates production)
}

// Upkeep breakdown for display
export interface UpkeepBreakdown {
  base: number;
  tierMultiplier: number;
  distanceMultiplier: number;
  regionMultiplier: number;
  buildingCost: number;
  total: number;
}

// Full node data (includes storage, buildings count, etc.)
export interface NodeDetail extends MapNode {
  storage: NodeResources;
  claimedAt: string | null;
  upkeepDue: string | null;
  upkeepPaid: string | null;
  upkeepCost?: UpkeepBreakdown; // Calculated upkeep cost
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
