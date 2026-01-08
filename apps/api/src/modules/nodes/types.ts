import type { NodeType, NodeStatus, RoadType, UpkeepStatus } from '@prisma/client';

// Node data for map display (minimal)
export interface MapNodeResponse {
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
  isHQ?: boolean;
  isCrown?: boolean; // True if this is the crown node for KOTH games
  upkeepStatus?: UpkeepStatus;
  claimedAt?: string | null; // When the node was claimed (used for crown countdown)
  storage?: Record<string, number>; // Resources stored in the node
}

// Full node details
export interface NodeDetailResponse extends MapNodeResponse {
  storage: Record<string, number>;
  claimedAt: string | null;
  upkeepDue: string | null;
  upkeepPaid: string | null;
  buildingCount: number;
  garrisonCount: number;
  attackCooldownUntil: string | null;
  attackImmunityUntil: string | null;
  connections: NodeConnectionResponse[];
  isHQ: boolean;
}

// Node connection info
export interface NodeConnectionResponse {
  id: string;
  toNodeId: string;
  toNodeName: string;
  toNodeType: NodeType;
  toNodeOwnerId: string | null;
  distance: number;
  dangerLevel: number;
  roadType: RoadType;
}

// Pagination
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Query params
export interface NodeListQuery {
  page?: number;
  pageSize?: number;
  regionId?: string;
  ownerId?: string;
  type?: NodeType;
  status?: NodeStatus;
  sessionId?: string; // Filter nodes by game session
}
