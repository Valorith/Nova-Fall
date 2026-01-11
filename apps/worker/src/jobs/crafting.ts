import { Queue } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { publishCraftingCompleted } from '../lib/events.js';
import type { CraftingQueue, ItemStorage } from '@nova-fall/shared';
import type { Prisma } from '@prisma/client';

// BullMQ queue for scheduling next crafting runs
// Uses the same connection as other queues
const craftingQueue = new Queue('crafting', {
  connection: redis,
});

// Redis key for tracking pending crafts
const CRAFTING_PENDING_KEY = 'crafting:pending';

// Job interval (5 seconds for faster polling)
export const CRAFTING_JOB_INTERVAL_MS = 5 * 1000;

interface BlueprintOutput {
  itemId: string;
  quantity: number;
}

interface BlueprintInput {
  itemId: string;
  quantity: number;
}

interface CompletedRun {
  queueItemId: string;
  blueprintId: string;
  runNumber: number;
  totalRuns: number;
  outputs: ItemStorage;
}

interface ProcessedNode {
  nodeId: string;
  newStorage: ItemStorage;
  newQueue: CraftingQueue;
  completedRuns: CompletedRun[];
  sessionId: string;
  playerId: string;
}

// Interface for scheduling the next crafting run
interface ScheduleNextRun {
  nodeId: string;
  delay: number;
}

// Track pending schedule requests (to be processed after DB transaction)
let pendingSchedules: ScheduleNextRun[] = [];

/**
 * Process completed crafts.
 * If nodeId is provided, only process that specific node.
 * Otherwise, uses Redis sorted set to find all nodes with due crafts.
 */
export async function processCompletedCrafts(nodeId?: string): Promise<number> {
  const now = Date.now();
  pendingSchedules = [];

  let dueNodeIds: string[];

  if (nodeId) {
    // Scheduled job for a specific node - just process that one
    dueNodeIds = [nodeId];
  } else {
    // Polling job - get all nodeIds with completesAt <= now from Redis sorted set
    dueNodeIds = await redis.zrangebyscore(CRAFTING_PENDING_KEY, 0, now);
  }

  if (dueNodeIds.length === 0) {
    return 0;
  }

  if (!nodeId) {
    console.log(`[Crafting] Processing ${dueNodeIds.length} nodes with pending crafts...`);
  }

  // Fetch all nodes with their data
  // Note: craftingQueue field added to schema but Prisma client may need regeneration
  const nodes = await prisma.node.findMany({
    where: { id: { in: dueNodeIds } },
  });

  // Type for node with craftingQueue (field added to schema)
  type NodeWithQueue = typeof nodes[0] & { craftingQueue?: Prisma.JsonValue };

  // Fetch blueprints for outputs lookup (batch all unique blueprint IDs)
  const blueprintIds = new Set<string>();
  for (const node of nodes) {
    const nodeWithQueue = node as NodeWithQueue;
    const queue = (nodeWithQueue.craftingQueue as unknown as CraftingQueue) || [];
    for (const item of queue) {
      blueprintIds.add(item.blueprintId);
    }
  }

  const blueprints = await prisma.blueprint.findMany({
    where: { id: { in: Array.from(blueprintIds) } },
    select: { id: true, inputs: true, outputs: true },
  });

  const blueprintOutputsMap = new Map<string, BlueprintOutput[]>(
    blueprints.map((bp) => [bp.id, bp.outputs as unknown as BlueprintOutput[]])
  );

  const blueprintInputsMap = new Map<string, BlueprintInput[]>(
    blueprints.map((bp) => [bp.id, bp.inputs as unknown as BlueprintInput[]])
  );

  // Process each node
  const processedNodes: ProcessedNode[] = [];
  const redisUpdates: { action: 'rem' | 'add'; nodeId: string; score?: number }[] = [];

  for (const node of nodes) {
    const nodeWithQueue = node as NodeWithQueue;
    const queue = (nodeWithQueue.craftingQueue as unknown as CraftingQueue) || [];
    if (queue.length === 0) {
      // Empty queue, remove from tracking
      redisUpdates.push({ action: 'rem', nodeId: node.id });
      continue;
    }

    const storage = { ...(node.storage as ItemStorage) };
    const completedRuns: CompletedRun[] = [];
    const newQueue = [...queue];

    // Process completed runs from the first item in queue
    while (newQueue.length > 0) {
      const item = newQueue[0];
      if (!item || item.completesAt > now) break;

      // Handle legacy items without new fields (default completedRuns=0, calculate timePerRun)
      const itemCompletedRuns = item.completedRuns ?? 0;
      const itemTimePerRun = item.timePerRun ?? Math.ceil((item.completesAt - item.startedAt) / Math.max(1, item.quantity - itemCompletedRuns));

      const outputs = blueprintOutputsMap.get(item.blueprintId);

      if (outputs) {
        // Add outputs for ONE run (one item produced)
        const outputStorage: ItemStorage = {};
        for (const output of outputs) {
          storage[output.itemId] = (storage[output.itemId] || 0) + output.quantity;
          outputStorage[output.itemId] = output.quantity;
        }

        // Track this completed run
        const newCompletedRuns = itemCompletedRuns + 1;
        completedRuns.push({
          queueItemId: item.id,
          blueprintId: item.blueprintId,
          runNumber: newCompletedRuns,
          totalRuns: item.quantity,
          outputs: outputStorage,
        });

        // Check if more runs remain
        if (newCompletedRuns < item.quantity) {
          // Check if materials are available for next run (per-run consumption)
          const inputs = blueprintInputsMap.get(item.blueprintId);
          let canStartNextRun = true;

          if (inputs && inputs.length > 0) {
            // Check if all required materials are available
            for (const input of inputs) {
              const available = storage[input.itemId] || 0;
              if (available < input.quantity) {
                canStartNextRun = false;
                console.log(`[Crafting] Insufficient materials for next run: need ${input.quantity} ${input.itemId}, have ${available}`);
                break;
              }
            }

            if (canStartNextRun) {
              // Consume materials for next run
              for (const input of inputs) {
                storage[input.itemId] = (storage[input.itemId] || 0) - input.quantity;
                if (storage[input.itemId] === 0) {
                  delete storage[input.itemId];
                }
              }
            }
          }

          if (canStartNextRun) {
            // Update item for next run
            newQueue[0] = {
              ...item,
              completedRuns: newCompletedRuns,
              timePerRun: itemTimePerRun,
              startedAt: now,
              completesAt: now + itemTimePerRun,
            };
            // Only process one run per cycle to allow UI updates
            break;
          } else {
            // Cannot start next run due to insufficient materials
            // Remove from queue (remaining runs cancelled)
            newQueue.shift();
            console.log(`[Crafting] Cancelled remaining ${item.quantity - newCompletedRuns} runs due to insufficient materials`);
          }
        } else {
          // All runs complete, remove from queue
          newQueue.shift();
        }
      } else {
        // No outputs defined, just remove the item
        newQueue.shift();
      }
    }

    // Only process if something completed
    if (completedRuns.length > 0) {
      processedNodes.push({
        nodeId: node.id,
        newStorage: storage,
        newQueue,
        completedRuns,
        sessionId: node.gameSessionId || '',
        playerId: node.ownerId || '',
      });

      // Update Redis tracking
      if (newQueue.length === 0) {
        redisUpdates.push({ action: 'rem', nodeId: node.id });
      } else {
        // Update with next run's completion time
        const nextItem = newQueue[0];
        if (nextItem) {
          redisUpdates.push({
            action: 'add',
            nodeId: node.id,
            score: nextItem.completesAt,
          });
          // Schedule next run immediately for instant responsiveness
          const delay = Math.max(0, nextItem.completesAt - now);
          pendingSchedules.push({ nodeId: node.id, delay });
        }
      }
    }
  }

  if (processedNodes.length === 0) {
    return 0;
  }

  // Execute all database updates in a transaction
  // Note: craftingQueue field added to schema, using type assertion until Prisma client regenerated
  await prisma.$transaction(
    processedNodes.map((pn) =>
      prisma.node.update({
        where: { id: pn.nodeId },
        data: {
          storage: pn.newStorage,
          craftingQueue: pn.newQueue as unknown as Prisma.InputJsonValue,
        } as Prisma.NodeUpdateInput,
      })
    )
  );

  // Update Redis sorted set
  const pipeline = redis.pipeline();
  for (const update of redisUpdates) {
    if (update.action === 'rem') {
      pipeline.zrem(CRAFTING_PENDING_KEY, update.nodeId);
    } else if (update.action === 'add' && update.score !== undefined) {
      pipeline.zadd(CRAFTING_PENDING_KEY, update.score, update.nodeId);
    }
  }
  await pipeline.exec();

  // Publish WebSocket events for each completed run
  const publishPromises: Promise<void>[] = [];
  for (const pn of processedNodes) {
    for (const completed of pn.completedRuns) {
      // Convert ItemStorage to Record<string, number> for event
      const outputsRecord: Record<string, number> = {};
      for (const [key, val] of Object.entries(completed.outputs)) {
        if (typeof val === 'number') outputsRecord[key] = val;
      }
      const storageRecord: Record<string, number> = {};
      for (const [key, val] of Object.entries(pn.newStorage)) {
        if (typeof val === 'number') storageRecord[key] = val;
      }

      // Convert queue to event format
      const queueForEvent = pn.newQueue.map((item) => ({
        id: item.id,
        blueprintId: item.blueprintId,
        ...(item.outputItemId && { outputItemId: item.outputItemId }),
        quantity: item.quantity,
        completedRuns: item.completedRuns ?? 0,
        timePerRun: item.timePerRun ?? 0,
        startedAt: item.startedAt,
        completesAt: item.completesAt,
      }));

      publishPromises.push(
        publishCraftingCompleted({
          nodeId: pn.nodeId,
          queueItemId: completed.queueItemId,
          blueprintId: completed.blueprintId,
          quantity: 1, // One item per run
          outputs: outputsRecord,
          storage: storageRecord,
          queue: queueForEvent,
          sessionId: pn.sessionId,
          playerId: pn.playerId,
        })
      );
    }
  }
  await Promise.all(publishPromises);

  // Schedule next runs for instant responsiveness
  // Add delayed jobs directly to BullMQ
  for (const schedule of pendingSchedules) {
    await craftingQueue.add(
      'crafting-scheduled',
      { nodeId: schedule.nodeId },
      { delay: schedule.delay }
    );
  }

  const totalRuns = processedNodes.reduce((sum, pn) => sum + pn.completedRuns.length, 0);
  if (totalRuns > 0) {
    console.log(`[Crafting] Completed ${totalRuns} runs across ${processedNodes.length} nodes`);
  }

  return totalRuns;
}
