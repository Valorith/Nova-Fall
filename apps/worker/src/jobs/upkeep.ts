import { prisma } from '../lib/prisma.js';
import { publisherRedis, redis } from '../lib/redis.js';
import { publishUpkeepTick } from '../lib/events.js';

// Redis key for storing next upkeep time
export const NEXT_UPKEEP_KEY = 'game:nextUpkeepAt';
import type { NodeType } from '@nova-fall/shared';
import { getRegion, type ResourceStorage, type ResourceType } from '@nova-fall/shared';
import {
  calculateNodeUpkeep,
  calculateDistanceFromHQ,
  buildOwnedAdjacencyMap,
  getUpkeepStatus,
  getDecayDamagePercent,
} from '@nova-fall/game-logic';

const ONE_HOUR_MS = 60 * 60 * 1000;

// Hourly production rates (resources generated per hour per node type)
const HOURLY_PRODUCTION: Record<string, Partial<Record<ResourceType, number>>> = {
  MINING: { iron: 100 },
  POWER_PLANT: { energy: 80 },
  REFINERY: { composites: 20 },
  RESEARCH: { minerals: 15 },
  AGRICULTURAL: { credits: 50 },
  TRADE_HUB: { credits: 200 },
  CAPITAL: { credits: 100, iron: 25, energy: 25 },
  FORTRESS: {},
};

interface PlayerEconomyResult {
  playerId: string;
  totalUpkeep: number;
  totalIncome: number;
  creditsBefore: number;
  creditsAfter: number;
  upkeepPaid: boolean;
  nodesProcessed: number;
  resourcesGenerated: ResourceStorage;
}

interface EconomyEvent {
  type: 'economy:processed';
  results: PlayerEconomyResult[];
  timestamp: string;
}

export async function processUpkeep(): Promise<void> {
  const startTime = Date.now();
  const nextUpkeepAt = startTime + ONE_HOUR_MS;

  // Store next upkeep time in Redis so game tick can broadcast it
  await redis.set(NEXT_UPKEEP_KEY, nextUpkeepAt.toString());

  // Broadcast upkeep timing for client progress bars
  await publishUpkeepTick({
    nextUpkeepAt,
    upkeepInterval: ONE_HOUR_MS,
  });

  console.log('[Economy] Starting hourly economy processing...');

  try {
    // Note: Resource transfers are processed by the dedicated transfers job (every minute)

    // Fetch all session players in ACTIVE sessions with their owned nodes
    const sessionPlayers = await prisma.gameSessionPlayer.findMany({
      where: {
        gameSession: {
          status: 'ACTIVE',
        },
        playerId: { not: null }, // Exclude spectators and unlinked bots
        role: 'PLAYER',
      },
      select: {
        id: true,
        playerId: true,
        hqNodeId: true,
        resources: true,
        gameSessionId: true,
        gameSession: {
          select: {
            id: true,
          },
        },
      },
    });

    if (sessionPlayers.length === 0) {
      console.log('[Upkeep] No active session players');
      return;
    }

    // Get all player IDs and session IDs
    const playerIds = sessionPlayers.map((sp) => sp.playerId).filter((id): id is string => id !== null);
    const sessionIds = [...new Set(sessionPlayers.map((sp) => sp.gameSessionId))];

    // Fetch nodes owned by these players in active sessions
    const ownedNodes = await prisma.node.findMany({
      where: {
        ownerId: { in: playerIds },
        gameSessionId: { in: sessionIds },
      },
      select: {
        id: true,
        ownerId: true,
        gameSessionId: true,
        type: true,
        tier: true,
        regionId: true,
        upkeepPaid: true,
        upkeepDue: true,
        upkeepStatus: true,
        buildings: {
          select: {
            typeId: true,
          },
        },
      },
    });

    // Group nodes by session player
    const nodesBySessionPlayer = new Map<string, typeof ownedNodes>();
    for (const sp of sessionPlayers) {
      const playerNodes = ownedNodes.filter(
        (n) => n.ownerId === sp.playerId && n.gameSessionId === sp.gameSessionId
      );
      nodesBySessionPlayer.set(sp.id, playerNodes);
    }

    // Fetch only connections relevant to owned nodes
    const allOwnedNodeIds = ownedNodes.map((n) => n.id);
    const connections = await prisma.nodeConnection.findMany({
      where: {
        OR: [
          { fromNodeId: { in: allOwnedNodeIds } },
          { toNodeId: { in: allOwnedNodeIds } },
        ],
      },
      select: {
        fromNodeId: true,
        toNodeId: true,
      },
    });

    const results: PlayerEconomyResult[] = [];
    const now = new Date();

    for (const sessionPlayer of sessionPlayers) {
      const playerNodes = nodesBySessionPlayer.get(sessionPlayer.id) ?? [];
      if (playerNodes.length === 0) continue;

      const playerResources = sessionPlayer.resources as ResourceStorage;
      const creditsBefore = playerResources.credits ?? 0;
      const hqNodeId = sessionPlayer.hqNodeId;

      if (!hqNodeId) {
        console.warn(`[Economy] Session player ${sessionPlayer.id} has no HQ, skipping`);
        continue;
      }

      // Build adjacency map for distance calculation
      const ownedNodeIds = playerNodes.map((n) => n.id);
      const adjacencyMap = buildOwnedAdjacencyMap(ownedNodeIds, connections);

      // Calculate upkeep and resource generation for all nodes
      let totalUpkeep = 0;
      let totalIncome = 0;
      const resourcesGenerated: ResourceStorage = {};

      for (const node of playerNodes) {
        const distance = calculateDistanceFromHQ(node.id, hqNodeId, adjacencyMap);
        const region = node.regionId ? getRegion(node.regionId) : undefined;

        // Calculate upkeep (skip HQ - it has no upkeep)
        if (node.id !== hqNodeId) {
          const breakdown = calculateNodeUpkeep({
            type: node.type as NodeType,
            tier: node.tier,
            distanceFromHQ: distance === Infinity ? 10 : distance,
            regionUpkeepModifier: region?.upkeepModifier ?? 1.0,
            buildings: node.buildings,
          });
          totalUpkeep += breakdown.total;
        }

        // Calculate resource production for this node type
        const production = HOURLY_PRODUCTION[node.type] ?? {};
        const tierMultiplier = 1 + (node.tier - 1) * 0.25; // 25% bonus per tier

        for (const [resourceType, baseAmount] of Object.entries(production)) {
          if (!baseAmount) continue;
          const amount = Math.floor(baseAmount * tierMultiplier);

          // Track credits separately as income
          if (resourceType === 'credits') {
            totalIncome += amount;
          }

          // Add to total generated
          resourcesGenerated[resourceType as ResourceType] =
            (resourcesGenerated[resourceType as ResourceType] ?? 0) + amount;
        }
      }

      // Calculate net credit change: income - upkeep
      const netCreditChange = totalIncome - totalUpkeep;
      const upkeepPaid = creditsBefore + totalIncome >= totalUpkeep;
      const creditsAfter = Math.max(0, creditsBefore + netCreditChange);

      // Update session player resources (credits adjusted + other resources added)
      const updatedResources: ResourceStorage = { ...playerResources, credits: creditsAfter };

      // Add non-credit resources to player inventory
      for (const [resourceType, amount] of Object.entries(resourcesGenerated)) {
        if (resourceType === 'credits' || !amount) continue;
        updatedResources[resourceType as ResourceType] =
          (updatedResources[resourceType as ResourceType] ?? 0) + amount;
      }

      await prisma.gameSessionPlayer.update({
        where: { id: sessionPlayer.id },
        data: { resources: updatedResources },
      });

      // Update node upkeep status - OPTIMIZED: batch by status type
      const nextDue = new Date(now.getTime() + ONE_HOUR_MS);

      if (upkeepPaid) {
        // All nodes paid - use single updateMany
        await prisma.node.updateMany({
          where: { id: { in: ownedNodeIds } },
          data: {
            upkeepPaid: now,
            upkeepDue: nextDue,
            upkeepStatus: 'PAID',
          },
        });
      } else {
        // HQ still gets marked paid
        if (hqNodeId) {
          await prisma.node.update({
            where: { id: hqNodeId },
            data: {
              upkeepPaid: now,
              upkeepDue: nextDue,
              upkeepStatus: 'PAID',
            },
          });
        }

        // Group unpaid nodes by their new status to reduce queries
        const statusGroups = new Map<string, string[]>();

        for (const node of playerNodes) {
          if (node.id === hqNodeId) continue;

          const lastPaid = node.upkeepPaid ?? node.upkeepDue ?? now;
          const hoursSincePayment = (now.getTime() - lastPaid.getTime()) / (1000 * 60 * 60);
          const newStatus = getUpkeepStatus(hoursSincePayment + 1);

          const existing = statusGroups.get(newStatus) ?? [];
          existing.push(node.id);
          statusGroups.set(newStatus, existing);
        }

        // Update each status group with single updateMany
        for (const [status, nodeIds] of statusGroups) {
          await prisma.node.updateMany({
            where: { id: { in: nodeIds } },
            data: {
              upkeepDue: nextDue,
              upkeepStatus: status as 'WARNING' | 'DECAY' | 'COLLAPSE',
            },
          });
        }
      }

      results.push({
        playerId: sessionPlayer.playerId ?? sessionPlayer.id,
        totalUpkeep,
        totalIncome,
        creditsBefore,
        creditsAfter,
        upkeepPaid,
        nodesProcessed: playerNodes.length,
        resourcesGenerated,
      });
    }

    // Process failure consequences (decay/collapse/abandonment)
    await processFailureConsequences();

    // Publish economy event
    const event: EconomyEvent = {
      type: 'economy:processed',
      results,
      timestamp: now.toISOString(),
    };
    await publisherRedis.publish('economy:processed', JSON.stringify(event));

    const duration = Date.now() - startTime;
    const paidCount = results.filter((r) => r.upkeepPaid).length;
    const unpaidCount = results.filter((r) => !r.upkeepPaid).length;
    const totalGenerated = results.reduce((sum, r) => sum + r.totalIncome, 0);

    console.log(
      `[Economy] Processed ${results.length} players in ${duration}ms. ` +
      `Upkeep paid: ${paidCount}, Unpaid: ${unpaidCount}, Credits generated: ${totalGenerated}`
    );
  } catch (error) {
    console.error('[Economy] Error processing economy tick:', error);
    throw error;
  }
}

/**
 * Process failure consequences for nodes that have not paid upkeep
 * Only processes nodes in active game sessions
 */
async function processFailureConsequences(): Promise<void> {
  const now = new Date();

  // Find nodes in decay or collapse status (only in active sessions)
  const failingNodes = await prisma.node.findMany({
    where: {
      upkeepStatus: {
        in: ['WARNING', 'DECAY', 'COLLAPSE'],
      },
      ownerId: { not: null },
      gameSession: {
        status: 'ACTIVE',
      },
    },
    select: {
      id: true,
      upkeepPaid: true,
      upkeepStatus: true,
      buildings: {
        select: {
          id: true,
          health: true,
          maxHealth: true,
        },
      },
    },
  });

  // OPTIMIZED: Collect all updates, execute in batches at the end
  const abandonedNodeIds: string[] = [];
  const statusUpdates = new Map<string, string[]>(); // status -> nodeIds
  const allBuildingUpdates: { id: string; newHealth: number }[] = [];

  for (const node of failingNodes) {
    const lastPaid = node.upkeepPaid ?? now;
    const hoursSincePayment = (now.getTime() - lastPaid.getTime()) / (1000 * 60 * 60);
    const currentStatus = getUpkeepStatus(hoursSincePayment);

    // Check for abandonment (48h+)
    if (currentStatus === 'ABANDONED') {
      abandonedNodeIds.push(node.id);
      continue;
    }

    // Collect decay damage for buildings
    const damagePercent = getDecayDamagePercent(hoursSincePayment);
    if (damagePercent > 0) {
      for (const building of node.buildings) {
        const damage = Math.floor(building.maxHealth * (damagePercent / 100));
        const newHealth = Math.max(0, building.health - damage);
        allBuildingUpdates.push({ id: building.id, newHealth });
      }
    }

    // Collect status updates
    if (currentStatus !== node.upkeepStatus) {
      const existing = statusUpdates.get(currentStatus) ?? [];
      existing.push(node.id);
      statusUpdates.set(currentStatus, existing);
    }
  }

  // Execute all updates in batch

  // 1. Abandoned nodes - single updateMany
  if (abandonedNodeIds.length > 0) {
    await prisma.node.updateMany({
      where: { id: { in: abandonedNodeIds } },
      data: {
        ownerId: null,
        status: 'NEUTRAL',
        upkeepStatus: 'PAID',
        upkeepPaid: null,
        upkeepDue: null,
        claimedAt: null,
      },
    });

    // Publish abandonment events
    for (const nodeId of abandonedNodeIds) {
      await publisherRedis.publish(
        'node:abandoned',
        JSON.stringify({
          nodeId,
          reason: 'upkeep_failure',
          timestamp: now.toISOString(),
        })
      );
    }
    console.log(`[Upkeep] ${abandonedNodeIds.length} nodes abandoned due to upkeep failure`);
  }

  // 2. Status updates - one updateMany per status
  for (const [status, nodeIds] of statusUpdates) {
    await prisma.node.updateMany({
      where: { id: { in: nodeIds } },
      data: { upkeepStatus: status as 'WARNING' | 'DECAY' | 'COLLAPSE' },
    });
  }

  // 3. Building damage - single transaction for all buildings
  if (allBuildingUpdates.length > 0) {
    await prisma.$transaction(
      allBuildingUpdates.map((update) =>
        prisma.building.update({
          where: { id: update.id },
          data: { health: update.newHealth },
        })
      )
    );
    console.log(`[Upkeep] Applied decay damage to ${allBuildingUpdates.length} buildings`);
  }
}
