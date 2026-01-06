import { prisma } from '../lib/prisma.js';
import { publishResourceUpdates, type ResourceUpdateEvent } from '../lib/events.js';
import {
  NODE_TYPE_CONFIGS,
  BASE_PRODUCTION_PER_TICK,
  BASE_CREDIT_GENERATION,
  NODE_BASE_STORAGE,
  addResources,
  type ResourceStorage,
  type ResourceType,
  NodeType,
} from '@nova-fall/shared';

let tickCount = 0;

export async function processGameTick(): Promise<void> {
  tickCount++;
  const startTime = Date.now();

  try {
    // Fetch all owned nodes with their current storage
    const ownedNodes = await prisma.node.findMany({
      where: {
        ownerId: { not: null },
        status: 'CLAIMED',
      },
      select: {
        id: true,
        type: true,
        storage: true,
      },
    });

    if (ownedNodes.length === 0) {
      return;
    }

    const updates: ResourceUpdateEvent[] = [];
    const dbUpdates: { id: string; storage: ResourceStorage }[] = [];

    for (const node of ownedNodes) {
      const nodeType = node.type as NodeType;
      const config = NODE_TYPE_CONFIGS[nodeType];
      const maxCapacity = NODE_BASE_STORAGE[nodeType] ?? 10000;
      let currentStorage = (node.storage as ResourceStorage) ?? {};
      const produced: ResourceStorage = {};

      // Calculate production for each resource type
      for (const [resourceType, baseRate] of Object.entries(BASE_PRODUCTION_PER_TICK)) {
        if (baseRate === 0) continue;

        // Apply node type bonus
        const bonus = config.resourceBonuses[resourceType as ResourceType] ?? 1.0;
        const production = Math.floor(baseRate * bonus);

        if (production > 0) {
          const { storage: newStorage, added } = addResources(
            currentStorage,
            resourceType as ResourceType,
            production,
            maxCapacity
          );
          currentStorage = newStorage;
          if (added > 0) {
            produced[resourceType as ResourceType] = added;
          }
        }
      }

      // Special handling for credits at trade hubs
      if (nodeType === NodeType.TRADE_HUB || nodeType === NodeType.CAPITAL) {
        const creditBonus = config.resourceBonuses.credits ?? 1.0;
        const creditProduction = Math.floor(BASE_CREDIT_GENERATION * creditBonus);

        const { storage: newStorage, added } = addResources(
          currentStorage,
          'credits',
          creditProduction,
          maxCapacity
        );
        currentStorage = newStorage;
        if (added > 0) {
          produced.credits = added;
        }
      }

      // Only record if something was produced
      if (Object.keys(produced).length > 0) {
        updates.push({
          nodeId: node.id,
          storage: currentStorage,
          produced,
        });
        dbUpdates.push({
          id: node.id,
          storage: currentStorage,
        });
      }
    }

    // Batch update database
    if (dbUpdates.length > 0) {
      await prisma.$transaction(
        dbUpdates.map((update) =>
          prisma.node.update({
            where: { id: update.id },
            data: { storage: update.storage },
          })
        )
      );

      // Broadcast updates via WebSocket
      await publishResourceUpdates({
        updates,
        tick: tickCount,
      });
    }

    const duration = Date.now() - startTime;
    if (tickCount % 12 === 0) {
      // Log every minute (12 ticks * 5 seconds)
      console.log(
        `[Tick ${tickCount}] Processed ${ownedNodes.length} nodes, ${updates.length} updated in ${duration}ms`
      );
    }
  } catch (error) {
    console.error(`[Tick ${tickCount}] Error processing game tick:`, error);
    throw error;
  }
}
