import { prisma } from '../lib/prisma.js';
import type { ResourceStorage } from '@nova-fall/shared';
import { publishTransferCompleted } from '../lib/events.js';

/**
 * Process completed transfers (called every minute by worker)
 * Moves resources from transit to destination nodes
 * Returns number of transfers processed
 *
 * Optimized to batch fetch nodes and process in a single transaction
 */
export async function processCompletedTransfers(): Promise<number> {
  const now = new Date();

  // Find all pending transfers that have completed (uses composite index)
  const completedTransfers = await prisma.resourceTransfer.findMany({
    where: {
      status: 'PENDING',
      completesAt: { lte: now },
    },
  });

  if (completedTransfers.length === 0) {
    return 0;
  }

  console.log(`[Transfers] Processing ${completedTransfers.length} completed transfers...`);

  // Batch fetch all relevant nodes in one query
  const nodeIds = new Set<string>();
  for (const transfer of completedTransfers) {
    nodeIds.add(transfer.sourceNodeId);
    nodeIds.add(transfer.destNodeId);
  }

  const nodes = await prisma.node.findMany({
    where: { id: { in: Array.from(nodeIds) } },
    select: { id: true, ownerId: true, storage: true },
  });

  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  // Categorize transfers and calculate storage updates
  const successfulTransfers: typeof completedTransfers = [];
  const cancelledTransfers: typeof completedTransfers = [];
  const nodeStorageUpdates = new Map<string, ResourceStorage>();

  for (const transfer of completedTransfers) {
    const destNode = nodesById.get(transfer.destNodeId);
    const sourceNode = nodesById.get(transfer.sourceNodeId);
    const transferResources = transfer.resources as Partial<ResourceStorage>;

    // Case 1: Destination node doesn't exist
    if (!destNode) {
      cancelledTransfers.push(transfer);
      continue;
    }

    // Case 2: Player lost ownership of destination
    if (destNode.ownerId !== transfer.playerId) {
      cancelledTransfers.push(transfer);

      // Return resources to source if player still owns it
      if (sourceNode && sourceNode.ownerId === transfer.playerId) {
        const currentStorage = nodeStorageUpdates.get(transfer.sourceNodeId)
          ?? { ...(sourceNode.storage as ResourceStorage) };

        for (const [resourceType, amount] of Object.entries(transferResources)) {
          if (amount && amount > 0) {
            const key = resourceType as keyof ResourceStorage;
            currentStorage[key] = (currentStorage[key] ?? 0) + amount;
          }
        }
        nodeStorageUpdates.set(transfer.sourceNodeId, currentStorage);
      }
      continue;
    }

    // Case 3: Successful transfer - add resources to destination
    successfulTransfers.push(transfer);
    const currentStorage = nodeStorageUpdates.get(transfer.destNodeId)
      ?? { ...(destNode.storage as ResourceStorage) };

    for (const [resourceType, amount] of Object.entries(transferResources)) {
      if (amount && amount > 0) {
        const key = resourceType as keyof ResourceStorage;
        currentStorage[key] = (currentStorage[key] ?? 0) + amount;
      }
    }
    nodeStorageUpdates.set(transfer.destNodeId, currentStorage);
  }

  // Execute all updates in a single transaction
  await prisma.$transaction(async (tx) => {
    // Batch update node storages
    const storageUpdatePromises = Array.from(nodeStorageUpdates.entries()).map(
      ([nodeId, storage]) => tx.node.update({
        where: { id: nodeId },
        data: { storage },
      })
    );

    // Batch update transfer statuses
    const statusUpdatePromises: Promise<unknown>[] = [];

    if (successfulTransfers.length > 0) {
      statusUpdatePromises.push(
        tx.resourceTransfer.updateMany({
          where: { id: { in: successfulTransfers.map((t) => t.id) } },
          data: { status: 'COMPLETED' },
        })
      );
    }

    if (cancelledTransfers.length > 0) {
      statusUpdatePromises.push(
        tx.resourceTransfer.updateMany({
          where: { id: { in: cancelledTransfers.map((t) => t.id) } },
          data: { status: 'CANCELLED' },
        })
      );
    }

    await Promise.all([...storageUpdatePromises, ...statusUpdatePromises]);
  });

  // Publish WebSocket events for completed transfers (in parallel)
  const publishPromises = [
    ...successfulTransfers.map((transfer) =>
      publishTransferCompleted({
        transferId: transfer.id,
        playerId: transfer.playerId,
        sourceNodeId: transfer.sourceNodeId,
        destNodeId: transfer.destNodeId,
        status: 'COMPLETED',
        sessionId: transfer.gameSessionId,
      })
    ),
    ...cancelledTransfers.map((transfer) =>
      publishTransferCompleted({
        transferId: transfer.id,
        playerId: transfer.playerId,
        sourceNodeId: transfer.sourceNodeId,
        destNodeId: transfer.destNodeId,
        status: 'CANCELLED',
        sessionId: transfer.gameSessionId,
      })
    ),
  ];
  await Promise.all(publishPromises);

  const successCount = successfulTransfers.length;
  const cancelledCount = cancelledTransfers.length;

  if (successCount > 0 || cancelledCount > 0) {
    console.log(`[Transfers] Completed: ${successCount}, Cancelled: ${cancelledCount}`);
  }

  return successCount;
}
