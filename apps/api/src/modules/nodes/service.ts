import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { publishNodeClaimed } from '../../lib/events.js';
import type { NodeStatus, NodeType } from '@prisma/client';
import type {
  MapNodeResponse,
  NodeDetailResponse,
  NodeConnectionResponse,
  PaginatedResponse,
  NodeListQuery,
} from './types.js';

// Cache keys
const CACHE_KEYS = {
  ALL_CONNECTIONS: 'cache:connections:all',
} as const;

// Cache TTLs in seconds
const CACHE_TTL = {
  CONNECTIONS: 60 * 60, // 1 hour - connections rarely change
} as const;

// Get paginated list of nodes for map display
export async function getNodes(query: NodeListQuery): Promise<PaginatedResponse<MapNodeResponse>> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));
  const skip = (page - 1) * pageSize;

  // Build where clause
  const where: {
    regionId?: string;
    ownerId?: string | null;
    type?: NodeType;
    status?: NodeStatus;
  } = {};

  if (query.regionId) where.regionId = query.regionId;
  if (query.ownerId !== undefined) where.ownerId = query.ownerId || null;
  if (query.type) where.type = query.type;
  if (query.status) where.status = query.status;

  const [nodes, total] = await Promise.all([
    prisma.node.findMany({
      where,
      skip,
      take: pageSize,
      include: {
        owner: {
          select: { displayName: true, hqNodeId: true },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.node.count({ where }),
  ]);

  const data: MapNodeResponse[] = nodes.map((node) => {
    const result: MapNodeResponse = {
      id: node.id,
      name: node.name,
      type: node.type,
      tier: node.tier,
      positionX: node.positionX,
      positionY: node.positionY,
      regionId: node.regionId,
      ownerId: node.ownerId,
      status: node.status,
    };
    if (node.owner?.displayName) {
      result.ownerName = node.owner.displayName;
    }
    if (node.owner?.hqNodeId === node.id) {
      result.isHQ = true;
    }
    return result;
  });

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// Get all nodes (no pagination, for initial map load)
export async function getAllNodes(): Promise<MapNodeResponse[]> {
  const nodes = await prisma.node.findMany({
    include: {
      owner: {
        select: { displayName: true, hqNodeId: true },
      },
    },
  });

  return nodes.map((node) => {
    const result: MapNodeResponse = {
      id: node.id,
      name: node.name,
      type: node.type,
      tier: node.tier,
      positionX: node.positionX,
      positionY: node.positionY,
      regionId: node.regionId,
      ownerId: node.ownerId,
      status: node.status,
    };
    if (node.owner?.displayName) {
      result.ownerName = node.owner.displayName;
    }
    // Check if this node is the owner's HQ
    if (node.owner?.hqNodeId === node.id) {
      result.isHQ = true;
    }
    // Include upkeep status for owned nodes
    if (node.ownerId) {
      result.upkeepStatus = node.upkeepStatus;
    }
    return result;
  });
}

// Get node by ID with full details
export async function getNodeById(nodeId: string): Promise<NodeDetailResponse | null> {
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    include: {
      owner: {
        select: { displayName: true, hqNodeId: true },
      },
      buildings: true,
      garrison: true,
      connectionsFrom: {
        include: {
          toNode: {
            select: { id: true, name: true, type: true, ownerId: true },
          },
        },
      },
      connectionsTo: {
        include: {
          fromNode: {
            select: { id: true, name: true, type: true, ownerId: true },
          },
        },
      },
    },
  });

  if (!node) return null;

  // Check if this node is the owner's HQ
  const isHQ = node.owner?.hqNodeId === nodeId;

  // Combine both directions of connections
  const connections: NodeConnectionResponse[] = [
    ...node.connectionsFrom.map((conn) => ({
      id: conn.id,
      toNodeId: conn.toNode.id,
      toNodeName: conn.toNode.name,
      toNodeType: conn.toNode.type,
      toNodeOwnerId: conn.toNode.ownerId,
      distance: conn.distance,
      dangerLevel: conn.dangerLevel,
      roadType: conn.roadType,
    })),
    ...node.connectionsTo.map((conn) => ({
      id: conn.id,
      toNodeId: conn.fromNode.id,
      toNodeName: conn.fromNode.name,
      toNodeType: conn.fromNode.type,
      toNodeOwnerId: conn.fromNode.ownerId,
      distance: conn.distance,
      dangerLevel: conn.dangerLevel,
      roadType: conn.roadType,
    })),
  ];

  const result: NodeDetailResponse = {
    id: node.id,
    name: node.name,
    type: node.type,
    tier: node.tier,
    positionX: node.positionX,
    positionY: node.positionY,
    regionId: node.regionId,
    ownerId: node.ownerId,
    status: node.status,
    storage: node.storage as Record<string, number>,
    claimedAt: node.claimedAt?.toISOString() ?? null,
    upkeepDue: node.upkeepDue?.toISOString() ?? null,
    upkeepPaid: node.upkeepPaid?.toISOString() ?? null,
    upkeepStatus: node.upkeepStatus,
    buildingCount: node.buildings.length,
    garrisonCount: node.garrison.length,
    attackCooldownUntil: node.attackCooldownUntil?.toISOString() ?? null,
    attackImmunityUntil: node.attackImmunityUntil?.toISOString() ?? null,
    connections,
    isHQ,
  };

  if (node.owner?.displayName) {
    result.ownerName = node.owner.displayName;
  }

  return result;
}

// Get connections for a node
export async function getNodeConnections(nodeId: string): Promise<NodeConnectionResponse[]> {
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    include: {
      connectionsFrom: {
        include: {
          toNode: {
            select: { id: true, name: true, type: true, ownerId: true },
          },
        },
      },
      connectionsTo: {
        include: {
          fromNode: {
            select: { id: true, name: true, type: true, ownerId: true },
          },
        },
      },
    },
  });

  if (!node) return [];

  return [
    ...node.connectionsFrom.map((conn) => ({
      id: conn.id,
      toNodeId: conn.toNode.id,
      toNodeName: conn.toNode.name,
      toNodeType: conn.toNode.type,
      toNodeOwnerId: conn.toNode.ownerId,
      distance: conn.distance,
      dangerLevel: conn.dangerLevel,
      roadType: conn.roadType,
    })),
    ...node.connectionsTo.map((conn) => ({
      id: conn.id,
      toNodeId: conn.fromNode.id,
      toNodeName: conn.fromNode.name,
      toNodeType: conn.fromNode.type,
      toNodeOwnerId: conn.fromNode.ownerId,
      distance: conn.distance,
      dangerLevel: conn.dangerLevel,
      roadType: conn.roadType,
    })),
  ];
}

// Claim a neutral node
export async function claimNode(
  nodeId: string,
  playerId: string
): Promise<{ success: boolean; error?: string; node?: NodeDetailResponse }> {
  // Get node with connections
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    include: {
      connectionsFrom: { select: { toNodeId: true } },
      connectionsTo: { select: { fromNodeId: true } },
    },
  });

  if (!node) {
    return { success: false, error: 'Node not found' };
  }

  // Check if node is neutral
  if (node.status !== 'NEUTRAL' || node.ownerId !== null) {
    return { success: false, error: 'Node is not neutral' };
  }

  // Get adjacent node IDs
  const adjacentNodeIds = [
    ...node.connectionsFrom.map((c) => c.toNodeId),
    ...node.connectionsTo.map((c) => c.fromNodeId),
  ];

  // Check if player owns any adjacent node (O(1) query instead of fetching all player nodes)
  // Also check if this is their first node in the same query
  const [adjacentOwned, playerNodeCount] = await Promise.all([
    prisma.node.findFirst({
      where: {
        id: { in: adjacentNodeIds },
        ownerId: playerId,
      },
      select: { id: true },
    }),
    prisma.node.count({
      where: { ownerId: playerId },
    }),
  ]);

  const isFirstNode = playerNodeCount === 0;

  if (!isFirstNode && !adjacentOwned) {
    return { success: false, error: 'Node must be adjacent to one of your nodes' };
  }

  // TODO: Check and deduct claiming cost (resources)
  // For MVP, we'll skip resource cost

  // Claim the node
  await prisma.node.update({
    where: { id: nodeId },
    data: {
      ownerId: playerId,
      status: 'CLAIMED',
      claimedAt: new Date(),
    },
  });

  // Update player stats and set HQ if first node
  const playerUpdateData: { totalNodes: { increment: number }; hqNodeId?: string } = {
    totalNodes: { increment: 1 },
  };

  if (isFirstNode) {
    playerUpdateData.hqNodeId = nodeId;
  }

  const player = await prisma.player.update({
    where: { id: playerId },
    data: playerUpdateData,
  });

  // Get updated node details
  const updatedNode = await getNodeById(nodeId);

  // Publish real-time event
  if (updatedNode) {
    const nodePayload: MapNodeResponse = {
      id: updatedNode.id,
      name: updatedNode.name,
      type: updatedNode.type,
      tier: updatedNode.tier,
      positionX: updatedNode.positionX,
      positionY: updatedNode.positionY,
      regionId: updatedNode.regionId,
      ownerId: updatedNode.ownerId,
      status: updatedNode.status,
    };
    if (updatedNode.ownerName) {
      nodePayload.ownerName = updatedNode.ownerName;
    }

    await publishNodeClaimed({
      nodeId,
      node: nodePayload,
      playerId,
      playerName: player.displayName,
    });

    return { success: true, node: updatedNode };
  }
  return { success: true };
}

// Get all connections (for map rendering) - CACHED
export async function getAllConnections() {
  // Try to get from cache first
  const cached = await redis.get(CACHE_KEYS.ALL_CONNECTIONS);
  if (cached) {
    return JSON.parse(cached);
  }

  // Fetch from database
  const connections = await prisma.nodeConnection.findMany({
    include: {
      fromNode: { select: { positionX: true, positionY: true } },
      toNode: { select: { positionX: true, positionY: true } },
    },
  });

  const result = connections.map((conn) => ({
    id: conn.id,
    fromX: conn.fromNode.positionX,
    fromY: conn.fromNode.positionY,
    toX: conn.toNode.positionX,
    toY: conn.toNode.positionY,
    roadType: conn.roadType,
    dangerLevel: conn.dangerLevel,
  }));

  // Cache for 1 hour
  await redis.setex(CACHE_KEYS.ALL_CONNECTIONS, CACHE_TTL.CONNECTIONS, JSON.stringify(result));

  return result;
}

// Invalidate connections cache (call when connections change)
export async function invalidateConnectionsCache(): Promise<void> {
  await redis.del(CACHE_KEYS.ALL_CONNECTIONS);
}

// Abandon a node (release ownership)
export async function abandonNode(
  nodeId: string,
  playerId: string
): Promise<{ success: boolean; error?: string }> {
  // Get node to verify ownership
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    select: { ownerId: true },
  });

  if (!node) {
    return { success: false, error: 'Node not found' };
  }

  if (node.ownerId !== playerId) {
    return { success: false, error: 'You do not own this node' };
  }

  // Check if this is the player's HQ
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { hqNodeId: true },
  });

  if (player?.hqNodeId === nodeId) {
    return { success: false, error: 'Cannot abandon your headquarters' };
  }

  // Abandon the node - reset to neutral
  await prisma.node.update({
    where: { id: nodeId },
    data: {
      ownerId: null,
      status: 'NEUTRAL',
      claimedAt: null,
      upkeepPaid: null,
      upkeepDue: null,
    },
  });

  // Update player stats
  await prisma.player.update({
    where: { id: playerId },
    data: {
      totalNodes: { decrement: 1 },
    },
  });

  // TODO: Publish node abandoned event for real-time updates

  return { success: true };
}
