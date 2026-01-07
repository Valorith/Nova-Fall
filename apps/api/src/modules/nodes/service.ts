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
    gameSessionId?: string | null;
  } = {};

  if (query.regionId) where.regionId = query.regionId;
  if (query.ownerId !== undefined) where.ownerId = query.ownerId || null;
  if (query.type) where.type = query.type;
  if (query.status) where.status = query.status;
  // Session filter: if sessionId provided, filter by it; else show nodes without session (legacy)
  if (query.sessionId) {
    where.gameSessionId = query.sessionId;
  }

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
export async function getAllNodes(sessionId?: string): Promise<MapNodeResponse[]> {
  // Build where clause for session filtering
  const where: { gameSessionId?: string | null } = {};
  if (sessionId) {
    where.gameSessionId = sessionId;
  }

  // Get nodes with owner info
  const nodes = await prisma.node.findMany({
    where,
    include: {
      owner: {
        select: { displayName: true, hqNodeId: true },
      },
    },
  });

  // If we have a session, get HQ mappings from GameSessionPlayer
  let sessionHQs: Map<string, string> = new Map();
  if (sessionId) {
    const sessionPlayers = await prisma.gameSessionPlayer.findMany({
      where: { gameSessionId: sessionId },
      select: { playerId: true, hqNodeId: true },
    });
    sessionHQs = new Map(
      sessionPlayers
        .filter((sp) => sp.hqNodeId)
        .map((sp) => [sp.playerId, sp.hqNodeId!])
    );
  }

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
    // Check if this node is the owner's HQ (from session or legacy player field)
    if (node.ownerId) {
      const sessionHQ = sessionHQs.get(node.ownerId);
      if (sessionHQ === node.id || node.owner?.hqNodeId === node.id) {
        result.isHQ = true;
      }
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

// Claim a neutral node (session-scoped)
export async function claimNode(
  nodeId: string,
  playerId: string,
  gameSessionId: string,
  sessionPlayerId: string
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

  // Check if node belongs to this session (or is unassigned)
  if (node.gameSessionId && node.gameSessionId !== gameSessionId) {
    return { success: false, error: 'Node belongs to another game session' };
  }

  // Get adjacent node IDs
  const adjacentNodeIds = [
    ...node.connectionsFrom.map((c) => c.toNodeId),
    ...node.connectionsTo.map((c) => c.fromNodeId),
  ];

  // Get session player to check their current node count and HQ
  const sessionPlayer = await prisma.gameSessionPlayer.findUnique({
    where: { id: sessionPlayerId },
  });

  if (!sessionPlayer) {
    return { success: false, error: 'Session player not found' };
  }

  const isFirstNode = sessionPlayer.totalNodes === 0;

  // Check if player owns any adjacent node within this session
  if (!isFirstNode) {
    const adjacentOwned = await prisma.node.findFirst({
      where: {
        id: { in: adjacentNodeIds },
        ownerId: playerId,
        gameSessionId: gameSessionId,
      },
      select: { id: true },
    });

    if (!adjacentOwned) {
      return { success: false, error: 'Node must be adjacent to one of your nodes' };
    }
  }

  // TODO: Check and deduct claiming cost (resources)
  // For MVP, we'll skip resource cost

  // Claim the node (assign to session if not already)
  await prisma.node.update({
    where: { id: nodeId },
    data: {
      ownerId: playerId,
      gameSessionId: gameSessionId,
      status: 'CLAIMED',
      claimedAt: new Date(),
    },
  });

  // Update session player stats and set HQ if first node
  const sessionPlayerUpdateData: {
    totalNodes: { increment: number };
    hqNodeId?: string;
  } = {
    totalNodes: { increment: 1 },
  };

  if (isFirstNode) {
    sessionPlayerUpdateData.hqNodeId = nodeId;
  }

  await prisma.gameSessionPlayer.update({
    where: { id: sessionPlayerId },
    data: sessionPlayerUpdateData,
  });

  // Also update the global player stats for backwards compatibility
  const player = await prisma.player.update({
    where: { id: playerId },
    data: {
      totalNodes: { increment: 1 },
    },
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
      sessionId: gameSessionId,
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

// Abandon a node (release ownership) - session-scoped
export async function abandonNode(
  nodeId: string,
  playerId: string,
  gameSessionId: string,
  sessionPlayerId: string
): Promise<{ success: boolean; error?: string }> {
  // Get node to verify ownership and session
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    select: { ownerId: true, gameSessionId: true },
  });

  if (!node) {
    return { success: false, error: 'Node not found' };
  }

  if (node.ownerId !== playerId) {
    return { success: false, error: 'You do not own this node' };
  }

  // Verify node belongs to the player's active session
  if (node.gameSessionId !== gameSessionId) {
    return { success: false, error: 'Node does not belong to your current session' };
  }

  // Check if this is the player's HQ in this session
  const sessionPlayer = await prisma.gameSessionPlayer.findUnique({
    where: { id: sessionPlayerId },
    select: { hqNodeId: true },
  });

  if (sessionPlayer?.hqNodeId === nodeId) {
    return { success: false, error: 'Cannot abandon your headquarters' };
  }

  // Abandon the node - reset to neutral but keep session assignment
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

  // Update session player stats
  await prisma.gameSessionPlayer.update({
    where: { id: sessionPlayerId },
    data: {
      totalNodes: { decrement: 1 },
    },
  });

  // Also update global player stats for backwards compatibility
  await prisma.player.update({
    where: { id: playerId },
    data: {
      totalNodes: { decrement: 1 },
    },
  });

  // TODO: Publish node abandoned event for real-time updates

  return { success: true };
}
