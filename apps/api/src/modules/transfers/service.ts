import { prisma } from '../../lib/prisma.js';
import type { ResourceStorage } from '@nova-fall/shared';
import {
  TRANSFER_TIME_PER_NODE_MS,
  TRANSFER_TIME_PER_RESOURCE_MS,
  type CreateTransferRequest,
  type TransferResponse,
} from './types.js';

/**
 * Calculate the shortest path distance between two nodes using BFS
 * Returns the number of nodes to traverse (1 = adjacent, 2 = one node between, etc.)
 * Returns null if no path exists
 */
async function calculatePathDistance(
  sourceNodeId: string,
  destNodeId: string,
  sessionId: string
): Promise<number | null> {
  if (sourceNodeId === destNodeId) return 0;

  // Get all connections for the session's nodes
  const connections = await prisma.nodeConnection.findMany({
    where: {
      fromNode: { gameSessionId: sessionId },
    },
    select: {
      fromNodeId: true,
      toNodeId: true,
    },
  });

  // Build adjacency list
  const adjacency = new Map<string, Set<string>>();
  for (const conn of connections) {
    if (!adjacency.has(conn.fromNodeId)) {
      adjacency.set(conn.fromNodeId, new Set());
    }
    if (!adjacency.has(conn.toNodeId)) {
      adjacency.set(conn.toNodeId, new Set());
    }
    adjacency.get(conn.fromNodeId)!.add(conn.toNodeId);
    adjacency.get(conn.toNodeId)!.add(conn.fromNodeId);
  }

  // BFS to find shortest path
  const visited = new Set<string>([sourceNodeId]);
  const queue: { nodeId: string; distance: number }[] = [{ nodeId: sourceNodeId, distance: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;

    const neighbors = adjacency.get(current.nodeId);
    if (!neighbors) continue;

    for (const neighborId of neighbors) {
      if (neighborId === destNodeId) {
        return current.distance + 1;
      }

      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push({ nodeId: neighborId, distance: current.distance + 1 });
      }
    }
  }

  return null; // No path found
}

/**
 * Format a transfer record for API response
 */
function formatTransfer(transfer: {
  id: string;
  sourceNodeId: string;
  destNodeId: string;
  resources: unknown;
  status: string;
  createdAt: Date;
  completesAt: Date;
}): TransferResponse {
  return {
    id: transfer.id,
    sourceNodeId: transfer.sourceNodeId,
    destNodeId: transfer.destNodeId,
    resources: transfer.resources as ResourceStorage,
    status: transfer.status as 'PENDING' | 'COMPLETED' | 'CANCELLED',
    createdAt: transfer.createdAt.toISOString(),
    completesAt: transfer.completesAt.toISOString(),
  };
}

/**
 * Create a new resource transfer between adjacent nodes
 */
export async function createTransfer(
  playerId: string,
  sessionId: string,
  request: CreateTransferRequest
): Promise<{ transfer: TransferResponse } | { error: string }> {
  const { sourceNodeId, destNodeId, resources } = request;

  // Validate resources - must have at least one resource to transfer
  const resourceEntries = Object.entries(resources).filter(([, amount]) => amount && amount > 0);
  if (resourceEntries.length === 0) {
    return { error: 'Must specify at least one resource to transfer' };
  }

  // Check nodes exist and are owned by player in this session
  const [sourceNode, destNode] = await Promise.all([
    prisma.node.findFirst({
      where: { id: sourceNodeId, gameSessionId: sessionId },
    }),
    prisma.node.findFirst({
      where: { id: destNodeId, gameSessionId: sessionId },
    }),
  ]);

  if (!sourceNode) {
    return { error: 'Source node not found in this session' };
  }
  if (!destNode) {
    return { error: 'Destination node not found in this session' };
  }
  if (sourceNode.ownerId !== playerId) {
    return { error: 'You do not own the source node' };
  }
  if (destNode.ownerId !== playerId) {
    return { error: 'You do not own the destination node' };
  }

  // Calculate path distance (no longer requires adjacency)
  const distance = await calculatePathDistance(sourceNodeId, destNodeId, sessionId);
  if (distance === null) {
    return { error: 'No path exists between these nodes' };
  }
  if (distance === 0) {
    return { error: 'Source and destination must be different nodes' };
  }

  // Check source node has sufficient resources
  const sourceStorage = sourceNode.storage as ResourceStorage;
  for (const [resourceType, amount] of resourceEntries) {
    const available = sourceStorage[resourceType as keyof ResourceStorage] ?? 0;
    if (available < (amount as number)) {
      return { error: `Insufficient ${resourceType}: have ${available}, need ${amount}` };
    }
  }

  // Calculate total quantity being transferred
  const totalQuantity = resourceEntries.reduce((sum, [, amount]) => sum + (amount as number), 0);

  // Calculate completion time based on distance and quantity
  // - 1 minute per node in path (minimum/distance factor)
  // - 1 second per resource unit (quantity factor)
  const distanceTimeMs = distance * TRANSFER_TIME_PER_NODE_MS;
  const quantityTimeMs = totalQuantity * TRANSFER_TIME_PER_RESOURCE_MS;
  const transferTimeMs = distanceTimeMs + quantityTimeMs;
  const completesAt = new Date(Date.now() + transferTimeMs);

  // Build the resources object with only positive amounts
  const transferResources: Partial<ResourceStorage> = {};
  for (const [resourceType, amount] of resourceEntries) {
    transferResources[resourceType as keyof ResourceStorage] = amount as number;
  }

  // Deduct resources from source and create transfer in a transaction
  const transfer = await prisma.$transaction(async (tx) => {
    // Update source node storage
    const newStorage = { ...sourceStorage };
    for (const [resourceType, amount] of resourceEntries) {
      const key = resourceType as keyof ResourceStorage;
      newStorage[key] = (newStorage[key] ?? 0) - (amount as number);
    }

    await tx.node.update({
      where: { id: sourceNodeId },
      data: { storage: newStorage },
    });

    // Create transfer record
    return tx.resourceTransfer.create({
      data: {
        gameSessionId: sessionId,
        playerId,
        sourceNodeId,
        destNodeId,
        resources: transferResources,
        completesAt,
        status: 'PENDING',
      },
    });
  });

  return { transfer: formatTransfer(transfer) };
}

/**
 * List all pending transfers for a player in a session
 */
export async function getPlayerTransfers(
  playerId: string,
  sessionId: string
): Promise<TransferResponse[]> {
  const transfers = await prisma.resourceTransfer.findMany({
    where: {
      playerId,
      gameSessionId: sessionId,
      status: 'PENDING',
    },
    orderBy: { completesAt: 'asc' },
  });

  return transfers.map(formatTransfer);
}

/**
 * Cancel a pending transfer and return resources to source node
 */
export async function cancelTransfer(
  playerId: string,
  transferId: string
): Promise<{ transfer: TransferResponse } | { error: string }> {
  // Find the transfer
  const transfer = await prisma.resourceTransfer.findUnique({
    where: { id: transferId },
  });

  if (!transfer) {
    return { error: 'Transfer not found' };
  }
  if (transfer.playerId !== playerId) {
    return { error: 'You do not own this transfer' };
  }
  if (transfer.status !== 'PENDING') {
    return { error: 'Transfer is not pending' };
  }

  // Return resources to source node and mark as cancelled
  const updatedTransfer = await prisma.$transaction(async (tx) => {
    // Get source node
    const sourceNode = await tx.node.findUnique({
      where: { id: transfer.sourceNodeId },
    });

    if (!sourceNode) {
      throw new Error('Source node not found');
    }

    // Add resources back to source
    const sourceStorage = sourceNode.storage as ResourceStorage;
    const transferResources = transfer.resources as Partial<ResourceStorage>;
    const newStorage = { ...sourceStorage };

    for (const [resourceType, amount] of Object.entries(transferResources)) {
      if (amount && amount > 0) {
        const key = resourceType as keyof ResourceStorage;
        newStorage[key] = (newStorage[key] ?? 0) + amount;
      }
    }

    await tx.node.update({
      where: { id: transfer.sourceNodeId },
      data: { storage: newStorage },
    });

    // Mark transfer as cancelled
    return tx.resourceTransfer.update({
      where: { id: transferId },
      data: { status: 'CANCELLED' },
    });
  });

  return { transfer: formatTransfer(updatedTransfer) };
}
