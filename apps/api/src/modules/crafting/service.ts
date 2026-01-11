import { prisma } from '../../lib/prisma.js';
import { redis, scheduleCraftingJob } from '../../lib/redis.js';
import {
  type Blueprint,
  type BlueprintMaterial,
  type CraftingQueue,
  type CraftingQueueItem,
  type ItemStorage,
  NodeType,
  applyEfficiencyToCraftingTime,
  nodeRequiresCore,
} from '@nova-fall/shared';
import type { StartCraftResult, CancelCraftResult } from './types.js';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

// Redis key for the crafting pending sorted set
const CRAFTING_PENDING_KEY = 'crafting:pending';

// Cache TTL for blueprints (5 minutes in seconds)
const BLUEPRINT_CACHE_TTL = 300;

/**
 * Get blueprints available for a specific node type and tier.
 * Filters to only include blueprints that:
 * - Do not require learning (learned=false), OR
 * - Have been learned by the player in this session
 */
export async function getBlueprintsForNode(
  nodeType: NodeType,
  nodeTier: number,
  playerId: string,
  sessionId: string
): Promise<Blueprint[]> {
  const cacheKey = `blueprints:${nodeType}:${nodeTier}`;

  // Try cache first for the full blueprint list
  let allBlueprints: Blueprint[];
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      allBlueprints = JSON.parse(cached) as Blueprint[];
    } catch {
      allBlueprints = await fetchAndCacheBlueprints(nodeType, nodeTier, cacheKey);
    }
  } else {
    allBlueprints = await fetchAndCacheBlueprints(nodeType, nodeTier, cacheKey);
  }

  // Fetch player's learned blueprints from their session participation
  const sessionPlayer = await prisma.gameSessionPlayer.findFirst({
    where: {
      playerId,
      gameSessionId: sessionId,
    },
  });

  type SessionPlayerWithLearned = NonNullable<typeof sessionPlayer> & { learnedBlueprints?: Prisma.JsonValue };
  const spWithLearned = sessionPlayer as SessionPlayerWithLearned | null;
  const learnedBlueprintIds = (spWithLearned?.learnedBlueprints as string[]) || [];

  // Filter to only include blueprints the player can use
  // Either: learned=false (doesn't need learning) OR blueprintId is in learnedBlueprintIds
  return allBlueprints.filter((bp) => {
    if (!bp.learned) {
      // Blueprint doesn't require learning
      return true;
    }
    // Blueprint requires learning - check if player has learned it
    return learnedBlueprintIds.includes(bp.id);
  });
}

/**
 * Fetch blueprints from DB and cache them.
 */
async function fetchAndCacheBlueprints(
  nodeType: NodeType,
  nodeTier: number,
  cacheKey: string
): Promise<Blueprint[]> {
  // Query database for matching blueprints
  const blueprints = await prisma.blueprint.findMany({
    where: {
      nodeTierRequired: { lte: nodeTier },
    },
  });

  // Filter blueprints that include this node type
  // (nodeTypes is stored as JSON array, need to parse and filter)
  const matchingBlueprints = blueprints.filter((bp) => {
    const nodeTypes = bp.nodeTypes as NodeType[];
    return Array.isArray(nodeTypes) && nodeTypes.includes(nodeType);
  });

  // Map to Blueprint type
  const result: Blueprint[] = matchingBlueprints.map((bp) => ({
    id: bp.id,
    name: bp.name,
    description: bp.description,
    category: bp.category as Blueprint['category'],
    quality: bp.quality as Blueprint['quality'],
    learned: bp.learned,
    craftTime: bp.craftTime,
    nodeTypes: bp.nodeTypes as NodeType[],
    nodeTierRequired: bp.nodeTierRequired,
    inputs: bp.inputs as unknown as BlueprintMaterial[],
    outputs: bp.outputs as unknown as BlueprintMaterial[],
    icon: bp.icon,
    createdAt: bp.createdAt.toISOString(),
    updatedAt: bp.updatedAt.toISOString(),
  }));

  // Cache for 5 minutes
  await redis.setex(cacheKey, BLUEPRINT_CACHE_TTL, JSON.stringify(result));

  return result;
}

/**
 * Invalidate blueprint cache when blueprints are modified.
 * Call this from blueprint editor endpoints.
 */
export async function invalidateBlueprintCache(): Promise<void> {
  const keys = await redis.keys('blueprints:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * Get the current crafting queue for a node.
 */
export async function getCraftingQueue(nodeId: string): Promise<CraftingQueue> {
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
  });

  if (!node) {
    return [];
  }

  // Note: craftingQueue field added to schema, type assertion until Prisma client regenerated
  type NodeWithQueue = typeof node & { craftingQueue?: Prisma.JsonValue };
  const nodeWithQueue = node as NodeWithQueue;
  return (nodeWithQueue.craftingQueue as unknown as CraftingQueue) || [];
}

/**
 * Get core efficiency for a node.
 * Returns 1 if no core installed or core not found.
 */
async function getNodeCoreEfficiency(installedCoreId: string | null): Promise<number> {
  if (!installedCoreId) {
    return 1;
  }

  // Look up the item definition for the installed core
  const itemDef = await prisma.itemDefinition.findFirst({
    where: { itemId: installedCoreId },
    select: { efficiency: true },
  });

  return itemDef?.efficiency ?? 1;
}

/**
 * Start crafting a blueprint at a node.
 */
export async function startCrafting(
  nodeId: string,
  playerId: string,
  sessionId: string,
  blueprintId: string,
  quantity: number
): Promise<StartCraftResult> {
  // Validate quantity
  if (quantity <= 0 || !Number.isInteger(quantity)) {
    return { success: false, error: 'Quantity must be a positive integer' };
  }

  // Fetch node, blueprint, and verify ownership in one go
  const [node, blueprint] = await Promise.all([
    prisma.node.findUnique({
      where: { id: nodeId },
    }),
    prisma.blueprint.findUnique({
      where: { id: blueprintId },
    }),
  ]);

  // Type for node with craftingQueue (field added to schema, assertion until Prisma regenerated)
  type NodeWithQueue = NonNullable<typeof node> & { craftingQueue?: Prisma.JsonValue };

  if (!node) {
    return { success: false, error: 'Node not found' };
  }

  if (node.ownerId !== playerId) {
    return { success: false, error: 'You do not own this node' };
  }

  if (!blueprint) {
    return { success: false, error: 'Blueprint not found' };
  }

  // Check node type compatibility
  const blueprintNodeTypes = blueprint.nodeTypes as NodeType[];
  if (!blueprintNodeTypes.includes(node.type as NodeType)) {
    return { success: false, error: `This blueprint cannot be crafted at a ${node.type} node` };
  }

  // Check tier requirement
  if (node.tier < blueprint.nodeTierRequired) {
    return {
      success: false,
      error: `This blueprint requires a Tier ${blueprint.nodeTierRequired} node (current: Tier ${node.tier})`,
    };
  }

  // Check if blueprint requires learning
  if (blueprint.learned) {
    // Fetch player's learned blueprints from their session participation
    const sessionPlayer = await prisma.gameSessionPlayer.findFirst({
      where: {
        playerId,
        gameSessionId: sessionId,
      },
    });

    type SessionPlayerWithLearned = NonNullable<typeof sessionPlayer> & { learnedBlueprints?: Prisma.JsonValue };
    const spWithLearned = sessionPlayer as SessionPlayerWithLearned | null;
    const learnedBlueprintIds = (spWithLearned?.learnedBlueprints as string[]) || [];

    if (!learnedBlueprintIds.includes(blueprintId)) {
      return {
        success: false,
        error: 'You have not learned this blueprint. Use a blueprint item to learn it first.',
      };
    }
  }

  // Check if node requires a core and has one installed
  const nodeType = node.type as NodeType;
  if (nodeRequiresCore(nodeType) && !node.installedCoreId) {
    return { success: false, error: 'This node requires an installed core to craft' };
  }

  // Calculate inputs needed for ONE run (per-run consumption model)
  const inputs = blueprint.inputs as { itemId: string; quantity: number }[];
  const storage = node.storage as ItemStorage;
  const inputsPerRun: ItemStorage = {};

  for (const input of inputs) {
    inputsPerRun[input.itemId] = (inputsPerRun[input.itemId] || 0) + input.quantity;
  }

  // Verify storage has sufficient materials for at least one run
  for (const [itemId, needed] of Object.entries(inputsPerRun)) {
    if (needed === undefined) continue;
    const available = storage[itemId] || 0;
    if (available < needed) {
      return {
        success: false,
        error: `Insufficient ${itemId}: have ${available}, need ${needed}`,
      };
    }
  }

  // Get core efficiency for crafting time calculation
  const efficiency = await getNodeCoreEfficiency(node.installedCoreId);

  // Calculate time per single run (one item)
  const baseTimePerRunMs = blueprint.craftTime * 1000;
  const timePerRun = applyEfficiencyToCraftingTime(baseTimePerRunMs, efficiency);

  // Determine start time (after last queued item fully completes all its runs, or now)
  const nodeWithQueue = node as NodeWithQueue;
  const currentQueue = (nodeWithQueue.craftingQueue as unknown as CraftingQueue) || [];
  const lastItem = currentQueue[currentQueue.length - 1];

  let startedAt: number;
  if (lastItem) {
    // Calculate when last item fully completes all its runs
    const lastItemRunsRemaining = lastItem.quantity - lastItem.completedRuns;
    const lastItemFullCompletion = lastItem.startedAt + (lastItemRunsRemaining * lastItem.timePerRun);
    startedAt = lastItemFullCompletion;
  } else {
    startedAt = Date.now();
  }

  // completesAt is when the FIRST run completes
  const completesAt = startedAt + timePerRun;

  // Get primary output item ID for display
  const outputs = blueprint.outputs as { itemId: string; quantity: number }[];
  const outputItemId = outputs[0]?.itemId;

  // Create queue item
  const queueItem: CraftingQueueItem = {
    id: randomUUID(),
    blueprintId,
    ...(outputItemId && { outputItemId }),
    quantity,
    completedRuns: 0,
    timePerRun,
    startedAt,
    completesAt,
  };

  // Perform transaction
  const result = await prisma.$transaction(async (tx) => {
    // Deduct materials for FIRST RUN ONLY (per-run consumption model)
    // Worker will consume materials for subsequent runs
    const newStorage = { ...storage };
    for (const [itemId, needed] of Object.entries(inputsPerRun)) {
      if (needed === undefined) continue;
      newStorage[itemId] = (newStorage[itemId] || 0) - needed;
      if (newStorage[itemId] === 0) {
        delete newStorage[itemId];
      }
    }

    // Add to queue
    const newQueue = [...currentQueue, queueItem];

    // Update node (craftingQueue field added to schema, type assertion until Prisma regenerated)
    await tx.node.update({
      where: { id: nodeId },
      data: {
        storage: newStorage,
        craftingQueue: newQueue as unknown as Prisma.InputJsonValue,
      } as Prisma.NodeUpdateInput,
    });

    return { storage: newStorage, queue: newQueue };
  });

  // Add to Redis sorted set for worker tracking (backup polling)
  // Only add if this is the first item (active craft) or update if existing
  const firstItemCompletesAt = result.queue[0]?.completesAt;
  if (firstItemCompletesAt) {
    await redis.zadd(CRAFTING_PENDING_KEY, firstItemCompletesAt, nodeId);
  }

  // Schedule a delayed job for instant completion
  // Only schedule if this is the first (active) item
  if (result.queue.length === 1 || currentQueue.length === 0) {
    await scheduleCraftingJob(nodeId, completesAt);
  }

  return {
    success: true,
    queue: result.queue,
    storage: result.storage,
  };
}

/**
 * Learn a blueprint by consuming a blueprint item from node storage.
 */
export async function learnBlueprint(
  nodeId: string,
  playerId: string,
  sessionId: string,
  blueprintItemId: string
): Promise<{
  success: boolean;
  error?: string;
  storage?: ItemStorage;
  learnedBlueprintId?: string;
  alreadyLearned?: boolean;
}> {
  // Find the node and verify ownership
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
  });

  if (!node) {
    return { success: false, error: 'Node not found' };
  }

  if (node.ownerId !== playerId) {
    return { success: false, error: 'You do not own this node' };
  }

  // Check node storage for the blueprint item
  const storage = node.storage as ItemStorage;
  const itemCount = storage[blueprintItemId] || 0;

  if (itemCount <= 0) {
    return { success: false, error: 'Blueprint item not found in node storage' };
  }

  // Find the item definition to get the linked blueprint
  const itemDef = await prisma.itemDefinition.findFirst({
    where: { itemId: blueprintItemId },
  });

  if (!itemDef) {
    return { success: false, error: 'Item definition not found' };
  }

  // Check if this is a learnable blueprint item:
  // Either isBlueprint flag is true, OR category is BLUEPRINT
  // In either case, linkedBlueprintId must be set
  const isBlueprintItem = itemDef.isBlueprint || itemDef.category === 'BLUEPRINT';
  if (!isBlueprintItem || !itemDef.linkedBlueprintId) {
    return { success: false, error: 'This item is not a learnable blueprint' };
  }

  // Find the blueprint to verify it requires learning
  const blueprint = await prisma.blueprint.findUnique({
    where: { id: itemDef.linkedBlueprintId },
  });

  if (!blueprint) {
    return { success: false, error: 'Linked blueprint not found' };
  }

  if (!blueprint.learned) {
    return { success: false, error: 'This blueprint is already available to all players' };
  }

  // Find the player's session participation
  const sessionPlayer = await prisma.gameSessionPlayer.findFirst({
    where: {
      playerId,
      gameSessionId: sessionId,
    },
  });

  if (!sessionPlayer) {
    return { success: false, error: 'Player not found in this session' };
  }

  // Check if already learned
  type SessionPlayerWithLearned = typeof sessionPlayer & { learnedBlueprints?: unknown };
  const spWithLearned = sessionPlayer as SessionPlayerWithLearned;
  const learnedBlueprints = (spWithLearned.learnedBlueprints as string[]) || [];

  if (learnedBlueprints.includes(blueprint.id)) {
    return { success: true, alreadyLearned: true, learnedBlueprintId: blueprint.id };
  }

  // Perform transaction: remove item, add to learned blueprints
  const result = await prisma.$transaction(async (tx) => {
    // Remove one blueprint item from storage
    const newStorage = { ...storage };
    newStorage[blueprintItemId] = (newStorage[blueprintItemId] || 0) - 1;
    if (newStorage[blueprintItemId] === 0) {
      delete newStorage[blueprintItemId];
    }

    // Update node storage
    await tx.node.update({
      where: { id: nodeId },
      data: { storage: newStorage },
    });

    // Add blueprint to learned list
    const newLearned = [...learnedBlueprints, blueprint.id];
    await tx.gameSessionPlayer.update({
      where: { id: sessionPlayer.id },
      data: { learnedBlueprints: newLearned },
    });

    return { storage: newStorage };
  });

  return {
    success: true,
    storage: result.storage,
    learnedBlueprintId: blueprint.id,
  };
}

/**
 * Check if a blueprint is learned by the player in their current session.
 * Returns the output item name (what will be crafted) rather than the blueprint name.
 */
export async function isBlueprintLearned(
  playerId: string,
  sessionId: string,
  blueprintId: string
): Promise<{ learned: boolean; blueprintName?: string }> {
  // Get the blueprint to check if it requires learning
  const blueprint = await prisma.blueprint.findUnique({
    where: { id: blueprintId },
    select: { id: true, name: true, learned: true, outputs: true },
  });

  if (!blueprint) {
    return { learned: false };
  }

  // Get the primary output item name (first output in the list)
  let outputItemName = blueprint.name; // Fallback to blueprint name
  const outputs = blueprint.outputs as Array<{ itemId: string; quantity: number }> | null;
  if (outputs && outputs.length > 0 && outputs[0]) {
    const outputItem = await prisma.itemDefinition.findUnique({
      where: { itemId: outputs[0].itemId },
      select: { name: true },
    });
    if (outputItem) {
      outputItemName = outputItem.name;
    }
  }

  // If blueprint doesn't require learning, it's always "learned"
  if (!blueprint.learned) {
    return { learned: true, blueprintName: outputItemName };
  }

  // Check player's session for learned blueprints
  const sessionPlayer = await prisma.gameSessionPlayer.findFirst({
    where: {
      playerId,
      gameSessionId: sessionId,
    },
  });

  if (!sessionPlayer) {
    return { learned: false, blueprintName: outputItemName };
  }

  type SessionPlayerWithLearned = typeof sessionPlayer & { learnedBlueprints?: unknown };
  const spWithLearned = sessionPlayer as SessionPlayerWithLearned;
  const learnedBlueprints = (spWithLearned.learnedBlueprints as string[]) || [];

  return {
    learned: learnedBlueprints.includes(blueprintId),
    blueprintName: outputItemName,
  };
}

/**
 * Cancel a queued craft and refund materials.
 */
export async function cancelCraft(
  nodeId: string,
  playerId: string,
  queueItemId: string
): Promise<CancelCraftResult> {
  // Fetch node (craftingQueue field added to schema, type assertion until Prisma regenerated)
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
  });

  if (!node) {
    return { success: false, error: 'Node not found' };
  }

  if (node.ownerId !== playerId) {
    return { success: false, error: 'You do not own this node' };
  }

  type NodeWithQueue = typeof node & { craftingQueue?: Prisma.JsonValue };
  const nodeWithQueue = node as NodeWithQueue;
  const queue = (nodeWithQueue.craftingQueue as unknown as CraftingQueue) || [];
  const itemIndex = queue.findIndex((item) => item.id === queueItemId);

  if (itemIndex === -1) {
    return { success: false, error: 'Queue item not found' };
  }

  const queueItem = queue[itemIndex];
  if (!queueItem) {
    return { success: false, error: 'Queue item not found' };
  }

  // Get blueprint to calculate refund
  const blueprint = await prisma.blueprint.findUnique({
    where: { id: queueItem.blueprintId },
  });

  if (!blueprint) {
    return { success: false, error: 'Blueprint not found for refund calculation' };
  }

  // Calculate refund amount based on per-run consumption model
  // Materials are consumed one run at a time:
  // - First run consumed when craft started
  // - Subsequent runs consumed by worker when each run begins
  const inputs = blueprint.inputs as unknown as { itemId: string; quantity: number }[];
  const refunded: ItemStorage = {};

  if (itemIndex === 0) {
    // Active craft (first in queue) - current run is in progress
    // Materials consumed: completedRuns + 1 (for current run)
    // Refund: proportional for current run only (future runs not yet consumed)
    const now = Date.now();
    const total = queueItem.completesAt - queueItem.startedAt;
    const elapsed = Math.max(0, now - queueItem.startedAt);
    const currentRunProgress = Math.min(1, elapsed / total);
    const currentRunRefundPercent = Math.max(0, 1 - currentRunProgress);

    for (const input of inputs) {
      // Only refund proportional amount for current run
      const currentRunRefund = Math.floor(input.quantity * currentRunRefundPercent);
      if (currentRunRefund > 0) {
        refunded[input.itemId] = currentRunRefund;
      }
    }
  } else {
    // Queued craft (not yet active) - first run materials consumed when added
    // Refund: full refund for 1 run (the pre-consumed first run)
    for (const input of inputs) {
      refunded[input.itemId] = input.quantity;
    }
  }

  // Perform transaction
  const result = await prisma.$transaction(async (tx) => {
    const storage = node.storage as ItemStorage;
    const newStorage = { ...storage };

    // Add refunded materials
    for (const [itemId, amount] of Object.entries(refunded)) {
      if (amount === undefined) continue;
      newStorage[itemId] = (newStorage[itemId] || 0) + amount;
    }

    // Remove item from queue and recalculate timestamps for remaining items
    const newQueue: CraftingQueue = [];
    let previousFullCompletion = Date.now();

    for (let i = 0; i < queue.length; i++) {
      if (i === itemIndex) {
        continue; // Skip the cancelled item
      }

      const item = queue[i];
      if (!item) continue;

      // Handle legacy items without new fields
      const itemCompletedRuns = item.completedRuns ?? 0;
      const itemTimePerRun = item.timePerRun ?? Math.ceil((item.completesAt - item.startedAt) / Math.max(1, item.quantity - itemCompletedRuns));

      // Calculate remaining runs for this item
      const itemRunsRemaining = item.quantity - itemCompletedRuns;

      if (newQueue.length === 0) {
        // First remaining item in new queue
        if (itemIndex === 0) {
          // We're cancelling the first item, so the next one becomes active now
          const newItem: CraftingQueueItem = {
            id: item.id,
            blueprintId: item.blueprintId,
            quantity: item.quantity,
            completedRuns: itemCompletedRuns,
            timePerRun: itemTimePerRun,
            startedAt: Date.now(),
            completesAt: Date.now() + itemTimePerRun,
          };
          newQueue.push(newItem);
          previousFullCompletion = Date.now() + (itemRunsRemaining * itemTimePerRun);
        } else {
          // Keep existing item as-is, but ensure it has the new fields
          const updatedItem: CraftingQueueItem = {
            ...item,
            completedRuns: itemCompletedRuns,
            timePerRun: itemTimePerRun,
          };
          newQueue.push(updatedItem);
          previousFullCompletion = item.startedAt + (itemRunsRemaining * itemTimePerRun);
        }
      } else {
        // Subsequent items chain after previous item fully completes
        const newItem: CraftingQueueItem = {
          id: item.id,
          blueprintId: item.blueprintId,
          quantity: item.quantity,
          completedRuns: itemCompletedRuns,
          timePerRun: itemTimePerRun,
          startedAt: previousFullCompletion,
          completesAt: previousFullCompletion + itemTimePerRun,
        };
        newQueue.push(newItem);
        previousFullCompletion = previousFullCompletion + (itemRunsRemaining * itemTimePerRun);
      }
    }

    // Update node (craftingQueue field added to schema, type assertion until Prisma regenerated)
    await tx.node.update({
      where: { id: nodeId },
      data: {
        storage: newStorage,
        craftingQueue: newQueue as unknown as Prisma.InputJsonValue,
      } as Prisma.NodeUpdateInput,
    });

    return { storage: newStorage, queue: newQueue };
  });

  // Update Redis sorted set
  if (result.queue.length === 0) {
    // No more items, remove from tracking
    await redis.zrem(CRAFTING_PENDING_KEY, nodeId);
  } else {
    // Update with new first item's completion time
    const firstItem = result.queue[0];
    if (firstItem) {
      await redis.zadd(CRAFTING_PENDING_KEY, firstItem.completesAt, nodeId);
    }
  }

  return {
    success: true,
    queue: result.queue,
    storage: result.storage,
    refunded,
  };
}
