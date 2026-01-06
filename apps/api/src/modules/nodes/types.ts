import type { NodeType, NodeStatus, RoadType } from '@prisma/client';

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
}

// Full node details
export interface NodeDetailResponse extends MapNodeResponse {
  storage: Record<string, number>;
  claimedAt: string | null;
  upkeepDue: string | null;
  buildingCount: number;
  garrisonCount: number;
  attackCooldownUntil: string | null;
  attackImmunityUntil: string | null;
  connections: NodeConnectionResponse[];
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
}
