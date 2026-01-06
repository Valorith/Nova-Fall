import { prisma } from '../../lib/prisma.js';
import { publishNodeClaimed } from '../../lib/events.js';
import type { NodeStatus, NodeType } from '@prisma/client';
import type {
  MapNodeResponse,
  NodeDetailResponse,
  NodeConnectionResponse,
  PaginatedResponse,
  NodeListQuery,
} from './types.js';

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
          select: { displayName: true },
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
        select: { displayName: true },
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
    return result;
  });
}

// Get node by ID with full details
export async function getNodeById(nodeId: string): Promise<NodeDetailResponse | null> {
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    include: {
      owner: {
        select: { displayName: true },
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
    buildingCount: node.buildings.length,
    garrisonCount: node.garrison.length,
    attackCooldownUntil: node.attackCooldownUntil?.toISOString() ?? null,
    attackImmunityUntil: node.attackImmunityUntil?.toISOString() ?? null,
    connections,
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

  // Get player's owned nodes
  const playerNodes = await prisma.node.findMany({
    where: { ownerId: playerId },
    select: { id: true },
  });

  const playerNodeIds = new Set(playerNodes.map((n) => n.id));

  // Check if player has any nodes yet (first node is free HQ claim)
  const isFirstNode = playerNodeIds.size === 0;

  if (!isFirstNode) {
    // Must be adjacent to an owned node
    const adjacentNodeIds = [
      ...node.connectionsFrom.map((c) => c.toNodeId),
      ...node.connectionsTo.map((c) => c.fromNodeId),
    ];

    const isAdjacent = adjacentNodeIds.some((id) => playerNodeIds.has(id));
    if (!isAdjacent) {
      return { success: false, error: 'Node must be adjacent to one of your nodes' };
    }
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

  // Update player stats and get player name
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
    });

    return { success: true, node: updatedNode };
  }
  return { success: true };
}

// Get all connections (for map rendering)
export async function getAllConnections() {
  const connections = await prisma.nodeConnection.findMany({
    include: {
      fromNode: { select: { positionX: true, positionY: true } },
      toNode: { select: { positionX: true, positionY: true } },
    },
  });

  return connections.map((conn) => ({
    id: conn.id,
    fromX: conn.fromNode.positionX,
    fromY: conn.fromNode.positionY,
    toX: conn.toNode.positionX,
    toY: conn.toNode.positionY,
    roadType: conn.roadType,
    dangerLevel: conn.dangerLevel,
  }));
}
