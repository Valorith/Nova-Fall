import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { publishResourceUpdates, publishGameTick, publishUpkeepTick, type ResourceUpdateEvent } from '../lib/events.js';
import { config } from '../config.js';
import { NEXT_UPKEEP_KEY } from './upkeep.js';
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

const ONE_HOUR_MS = 60 * 60 * 1000;
let tickCount = 0;

export async function processGameTick(): Promise<void> {
  tickCount++;
  const startTime = Date.now();
  const tickInterval = config.game.tickInterval;
  const nextTickAt = startTime + tickInterval;

  // Broadcast tick event immediately so clients can sync their progress bars
  await publishGameTick({
    tick: tickCount,
    tickInterval,
    nextTickAt,
  });

  // Also broadcast upkeep timing (read from Redis, or calculate if not set)
  let nextUpkeepAt = parseInt(await redis.get(NEXT_UPKEEP_KEY) ?? '0', 10);
  if (!nextUpkeepAt || nextUpkeepAt < startTime) {
    // Calculate next upkeep time aligned to the hour
    nextUpkeepAt = startTime + ONE_HOUR_MS;
    await redis.set(NEXT_UPKEEP_KEY, nextUpkeepAt.toString());
  }
  await publishUpkeepTick({
    nextUpkeepAt,
    upkeepInterval: ONE_HOUR_MS,
  });

  try {
    // Fetch owned nodes only in ACTIVE game sessions
    const ownedNodes = await prisma.node.findMany({
      where: {
        ownerId: { not: null },
        status: 'CLAIMED',
        gameSession: {
          status: 'ACTIVE',
        },
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

    // Batch update database using raw SQL (single query instead of N queries)
    if (dbUpdates.length > 0) {
      // Build CASE/WHEN statement for batch update
      const caseStatements = dbUpdates
        .map((update) => {
          const storageJson = JSON.stringify(update.storage);
          return Prisma.sql`WHEN id = ${update.id} THEN ${storageJson}::jsonb`;
        });

      const nodeIds = dbUpdates.map((update) => update.id);

      await prisma.$executeRaw`
        UPDATE "Node"
        SET "storage" = CASE ${Prisma.join(caseStatements, ' ')} END,
            "updatedAt" = NOW()
        WHERE id IN (${Prisma.join(nodeIds)})
      `;

      // Broadcast updates via WebSocket
      await publishResourceUpdates({
        updates,
        tick: tickCount,
      });
    }

    const duration = Date.now() - startTime;
    if (tickCount % 2 === 0) {
      // Log every minute (2 ticks * 30 seconds)
      console.log(
        `[Tick ${tickCount}] Processed ${ownedNodes.length} nodes, ${updates.length} updated in ${duration}ms`
      );
    }
  } catch (error) {
    console.error(`[Tick ${tickCount}] Error processing game tick:`, error);
    throw error;
  }
}
