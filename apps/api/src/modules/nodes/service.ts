import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { publishNodeClaimed, publishCrownChanged } from '../../lib/events.js';
import {
  NODE_CLAIM_COST_BY_TIER,
  type ResourceStorage,
  type ItemStorage,
  type CraftingQueue,
  nodeRequiresCore,
} from '@nova-fall/shared';
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
    // Type assertion for craftingQueue field (added to schema)
    type NodeWithQueue = typeof node & { craftingQueue?: unknown };
    const nodeWithQueue = node as NodeWithQueue;

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
      storage: node.storage as Record<string, number>,
      installedCoreId: node.installedCoreId,
      craftingQueue: (nodeWithQueue.craftingQueue as unknown as CraftingQueue) || [],
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

  // If we have a session, get HQ mappings from GameSessionPlayer and crown node
  let sessionHQs = new Map<string, string>();
  let crownNodeId: string | null = null;

  if (sessionId) {
    // Get session info including crown node
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      select: { crownNodeId: true },
    });
    crownNodeId = session?.crownNodeId ?? null;

    // Get player HQs
    const sessionPlayers = await prisma.gameSessionPlayer.findMany({
      where: { gameSessionId: sessionId },
      select: { playerId: true, hqNodeId: true },
    });
    sessionHQs = new Map(
      sessionPlayers
        .filter((sp): sp is { playerId: string; hqNodeId: string } =>
          sp.playerId !== null && sp.hqNodeId !== null)
        .map((sp) => [sp.playerId, sp.hqNodeId])
    );
  }

  return nodes.map((node) => {
    // Type assertion for craftingQueue field (added to schema)
    type NodeWithQueue = typeof node & { craftingQueue?: unknown };
    const nodeWithQueue = node as NodeWithQueue;

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
      storage: node.storage as Record<string, number>,
      installedCoreId: node.installedCoreId,
      craftingQueue: (nodeWithQueue.craftingQueue as unknown as CraftingQueue) || [],
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
    // Mark crown node - use session's crownNodeId if available, otherwise fall back to type
    // This ensures only the correct crown is marked when querying by session
    const isCrown = crownNodeId ? node.id === crownNodeId : node.type === 'CROWN';
    if (isCrown) {
      result.isCrown = true;
      // Include claimedAt for crown countdown display
      if (node.claimedAt) {
        result.claimedAt = node.claimedAt.toISOString();
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
    installedCoreId: node.installedCoreId,
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
): Promise<{ success: boolean; error?: string; node?: NodeDetailResponse; resources?: ResourceStorage }> {
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
  if (node.ownerId !== null) {
    return { success: false, error: 'Node is already owned by another player' };
  }
  if (node.status !== 'NEUTRAL') {
    return { success: false, error: `Node is not neutral (status: ${node.status})` };
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

  // Check and deduct claiming cost (credits based on node tier)
  const claimCost = NODE_CLAIM_COST_BY_TIER[node.tier] ?? NODE_CLAIM_COST_BY_TIER[1] ?? 100;
  const playerResources = sessionPlayer.resources as ResourceStorage;
  const currentCredits = playerResources.credits ?? 0;

  if (currentCredits < claimCost) {
    return {
      success: false,
      error: `Not enough credits to claim this node. Need ${claimCost}, have ${currentCredits}`,
    };
  }

  // Deduct the claim cost
  const updatedResources: ResourceStorage = {
    ...playerResources,
    credits: currentCredits - claimCost,
  };

  await prisma.gameSessionPlayer.update({
    where: { id: sessionPlayerId },
    data: { resources: updatedResources },
  });

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
      storage: updatedNode.storage,
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

    // Check if this is the crown node for a KOTH game
    const session = await prisma.gameSession.findUnique({
      where: { id: gameSessionId },
      select: { crownNodeId: true, gameType: true },
    });

    if (session?.gameType === 'KING_OF_THE_HILL' && session.crownNodeId === nodeId) {
      await publishCrownChanged({
        sessionId: gameSessionId,
        crownNodeId: nodeId,
      });
    }

    return { success: true, node: updatedNode, resources: updatedResources };
  }
  return { success: true, resources: updatedResources };
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

// ==================== NODE CORE MANAGEMENT ====================

export interface CorePurchaseResult {
  success: boolean;
  error?: string;
  storage?: ItemStorage;
  creditsRemaining?: number;
}

export interface CoreInstallResult {
  success: boolean;
  error?: string;
  installedCoreId?: string;
  storage?: ItemStorage;
}

// Purchase an item at HQ - adds to HQ storage
export async function purchaseItem(
  nodeId: string,
  itemId: string,
  playerId: string,
  gameSessionId: string,
  sessionPlayerId: string,
  quantity: number = 1
): Promise<CorePurchaseResult> {
  // Look up item from ItemDefinition database (any item with hqCost set)
  const itemDef = await prisma.itemDefinition.findFirst({
    where: {
      itemId: itemId,
      hqCost: { not: null },
    },
  });

  if (!itemDef || itemDef.hqCost === null) {
    return { success: false, error: 'Invalid item or item not purchasable at HQ' };
  }

  // Get session player to check HQ and credits
  const sessionPlayer = await prisma.gameSessionPlayer.findUnique({
    where: { id: sessionPlayerId },
    select: {
      hqNodeId: true,
      resources: true,
    },
  });

  if (!sessionPlayer?.hqNodeId) {
    return { success: false, error: 'No headquarters found' };
  }

  // Verify the nodeId is the HQ
  if (nodeId !== sessionPlayer.hqNodeId) {
    return { success: false, error: 'Items can only be purchased at your headquarters' };
  }

  // Validate quantity
  if (quantity < 1 || !Number.isInteger(quantity)) {
    return { success: false, error: 'Invalid quantity' };
  }

  // Check if player has enough credits
  const playerResources = sessionPlayer.resources as ResourceStorage;
  const credits = playerResources.credits ?? 0;
  const totalCost = itemDef.hqCost * quantity;

  if (credits < totalCost) {
    return { success: false, error: `Not enough credits. Need ${totalCost}, have ${credits}` };
  }

  // Get HQ node to add core to storage
  const hqNode = await prisma.node.findUnique({
    where: { id: sessionPlayer.hqNodeId },
    select: { id: true, storage: true, ownerId: true, gameSessionId: true },
  });

  if (!hqNode || hqNode.ownerId !== playerId || hqNode.gameSessionId !== gameSessionId) {
    return { success: false, error: 'HQ not found or not owned by you' };
  }

  // Deduct credits and add item to HQ storage
  const updatedCredits = credits - totalCost;
  const hqStorage = hqNode.storage as ItemStorage;
  const currentItemCount = hqStorage[itemId] ?? 0;
  const updatedStorage: ItemStorage = {
    ...hqStorage,
    [itemId]: currentItemCount + quantity,
  };

  // Update both in a transaction
  await prisma.$transaction([
    prisma.gameSessionPlayer.update({
      where: { id: sessionPlayerId },
      data: {
        resources: { ...playerResources, credits: updatedCredits },
      },
    }),
    prisma.node.update({
      where: { id: hqNode.id },
      data: { storage: updatedStorage },
    }),
  ]);

  return {
    success: true,
    storage: updatedStorage,
    creditsRemaining: updatedCredits,
  };
}

// Install a core from node storage into the node
export async function installCore(
  nodeId: string,
  coreId: string,
  playerId: string,
  gameSessionId: string
): Promise<CoreInstallResult> {
  // Look up core from ItemDefinition database
  const coreDef = await prisma.itemDefinition.findFirst({
    where: {
      itemId: coreId,
      category: 'NODE_CORE',
    },
  });

  if (!coreDef) {
    return { success: false, error: 'Invalid core type' };
  }

  // Get node to check ownership and type
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    select: {
      id: true,
      type: true,
      ownerId: true,
      gameSessionId: true,
      storage: true,
      installedCoreId: true,
    },
  });

  if (!node) {
    return { success: false, error: 'Node not found' };
  }

  if (node.ownerId !== playerId || node.gameSessionId !== gameSessionId) {
    return { success: false, error: 'You do not own this node' };
  }

  // Check if node already has a core installed
  if (node.installedCoreId) {
    return { success: false, error: 'Node already has a core installed. Destroy it first.' };
  }

  // Check if this core type can be installed in this node type
  if (coreDef.targetNodeType && coreDef.targetNodeType !== node.type) {
    return {
      success: false,
      error: `${coreDef.name} can only be installed in ${coreDef.targetNodeType.replace(/_/g, ' ')} nodes`,
    };
  }

  // Check if node has the core in storage
  const nodeStorage = node.storage as ItemStorage;
  const coreCount = nodeStorage[coreId] ?? 0;

  if (coreCount < 1) {
    return { success: false, error: 'No core of this type in node storage' };
  }

  // Remove core from storage and install it
  const updatedStorage: ItemStorage = { ...nodeStorage };
  if (coreCount === 1) {
    delete updatedStorage[coreId];
  } else {
    updatedStorage[coreId] = coreCount - 1;
  }

  await prisma.node.update({
    where: { id: nodeId },
    data: {
      storage: updatedStorage,
      installedCoreId: coreId,
    },
  });

  return { success: true, installedCoreId: coreId, storage: updatedStorage };
}

// Destroy an installed core (cannot be recovered)
export async function destroyCore(
  nodeId: string,
  playerId: string,
  gameSessionId: string
): Promise<CoreInstallResult> {
  // Get node to check ownership
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    select: {
      id: true,
      type: true,
      ownerId: true,
      gameSessionId: true,
      installedCoreId: true,
      storage: true,
    },
  });

  if (!node) {
    return { success: false, error: 'Node not found' };
  }

  if (node.ownerId !== playerId || node.gameSessionId !== gameSessionId) {
    return { success: false, error: 'You do not own this node' };
  }

  if (!node.installedCoreId) {
    return { success: false, error: 'No core installed in this node' };
  }

  // Check if this is an HQ or Crown node (always active, can't have cores)
  if (!nodeRequiresCore(node.type as unknown as import('@nova-fall/shared').NodeType)) {
    return { success: false, error: 'This node type does not use cores' };
  }

  // Remove the installed core
  await prisma.node.update({
    where: { id: nodeId },
    data: { installedCoreId: null },
  });

  return { success: true, storage: node.storage as ItemStorage };
}
