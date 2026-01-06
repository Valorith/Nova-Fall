import { prisma } from '../lib/prisma.js';
import { publisherRedis } from '../lib/redis.js';
import { getRegion, type ResourceStorage, NodeType } from '@nova-fall/shared';
import {
  calculateNodeUpkeep,
  calculateDistanceFromHQ,
  buildOwnedAdjacencyMap,
  getUpkeepStatus,
  getDecayDamagePercent,
} from '@nova-fall/game-logic';

interface PlayerUpkeepResult {
  playerId: string;
  totalUpkeep: number;
  creditsBefore: number;
  creditsAfter: number;
  paid: boolean;
  nodesProcessed: number;
}

interface UpkeepEvent {
  type: 'upkeep:processed';
  results: PlayerUpkeepResult[];
  timestamp: string;
}

export async function processUpkeep(): Promise<void> {
  const startTime = Date.now();
  console.log('[Upkeep] Starting hourly upkeep processing...');

  try {
    // Fetch all players with owned nodes
    const players = await prisma.player.findMany({
      where: {
        ownedNodes: {
          some: {},
        },
      },
      select: {
        id: true,
        hqNodeId: true,
        resources: true,
        ownedNodes: {
          select: {
            id: true,
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
        },
      },
    });

    if (players.length === 0) {
      console.log('[Upkeep] No players with owned nodes');
      return;
    }

    // Fetch all connections for distance calculation
    const connections = await prisma.nodeConnection.findMany({
      select: {
        fromNodeId: true,
        toNodeId: true,
      },
    });

    const results: PlayerUpkeepResult[] = [];
    const now = new Date();

    for (const player of players) {
      const playerResources = player.resources as ResourceStorage;
      const creditsBefore = playerResources.credits ?? 0;
      const hqNodeId = player.hqNodeId;

      if (!hqNodeId) {
        console.warn(`[Upkeep] Player ${player.id} has no HQ, skipping`);
        continue;
      }

      // Build adjacency map for distance calculation
      const ownedNodeIds = player.ownedNodes.map((n) => n.id);
      const adjacencyMap = buildOwnedAdjacencyMap(ownedNodeIds, connections);

      // Calculate total upkeep for all nodes
      let totalUpkeep = 0;
      const nodeUpkeeps: Array<{ nodeId: string; upkeep: number; distance: number }> = [];

      for (const node of player.ownedNodes) {
        // Skip HQ - it has no upkeep
        if (node.id === hqNodeId) continue;

        const distance = calculateDistanceFromHQ(node.id, hqNodeId, adjacencyMap);
        const region = node.regionId ? getRegion(node.regionId) : undefined;

        const breakdown = calculateNodeUpkeep({
          type: node.type as NodeType,
          tier: node.tier,
          distanceFromHQ: distance === Infinity ? 10 : distance, // Cap disconnected nodes at 10
          regionUpkeepModifier: region?.upkeepModifier ?? 1.0,
          buildings: node.buildings,
        });

        totalUpkeep += breakdown.total;
        nodeUpkeeps.push({
          nodeId: node.id,
          upkeep: breakdown.total,
          distance,
        });
      }

      // Attempt to deduct upkeep
      const paid = creditsBefore >= totalUpkeep;
      const creditsAfter = paid ? creditsBefore - totalUpkeep : creditsBefore;

      // Update player resources
      await prisma.player.update({
        where: { id: player.id },
        data: {
          resources: {
            ...playerResources,
            credits: creditsAfter,
          },
        },
      });

      // Update node upkeep status
      const nodeUpdates = player.ownedNodes.map((node) => {
        // HQ always paid
        if (node.id === hqNodeId) {
          return prisma.node.update({
            where: { id: node.id },
            data: {
              upkeepPaid: now,
              upkeepDue: new Date(now.getTime() + 60 * 60 * 1000), // +1 hour
              upkeepStatus: 'PAID',
            },
          });
        }

        if (paid) {
          // Upkeep paid - reset status
          return prisma.node.update({
            where: { id: node.id },
            data: {
              upkeepPaid: now,
              upkeepDue: new Date(now.getTime() + 60 * 60 * 1000), // +1 hour
              upkeepStatus: 'PAID',
            },
          });
        } else {
          // Upkeep not paid - calculate hours since last payment
          const lastPaid = node.upkeepPaid ?? node.upkeepDue ?? now;
          const hoursSincePayment = (now.getTime() - lastPaid.getTime()) / (1000 * 60 * 60);
          const newStatus = getUpkeepStatus(hoursSincePayment + 1); // +1 for this missed payment

          return prisma.node.update({
            where: { id: node.id },
            data: {
              upkeepDue: new Date(now.getTime() + 60 * 60 * 1000), // +1 hour
              upkeepStatus: newStatus,
            },
          });
        }
      });

      await prisma.$transaction(nodeUpdates);

      results.push({
        playerId: player.id,
        totalUpkeep,
        creditsBefore,
        creditsAfter,
        paid,
        nodesProcessed: player.ownedNodes.length,
      });
    }

    // Process failure consequences (decay/collapse/abandonment)
    await processFailureConsequences();

    // Publish upkeep event
    const event: UpkeepEvent = {
      type: 'upkeep:processed',
      results,
      timestamp: now.toISOString(),
    };
    await publisherRedis.publish('upkeep:processed', JSON.stringify(event));

    const duration = Date.now() - startTime;
    const paidCount = results.filter((r) => r.paid).length;
    const unpaidCount = results.filter((r) => !r.paid).length;

    console.log(
      `[Upkeep] Processed ${results.length} players in ${duration}ms. Paid: ${paidCount}, Unpaid: ${unpaidCount}`
    );
  } catch (error) {
    console.error('[Upkeep] Error processing upkeep:', error);
    throw error;
  }
}

/**
 * Process failure consequences for nodes that have not paid upkeep
 */
async function processFailureConsequences(): Promise<void> {
  const now = new Date();

  // Find nodes in decay or collapse status
  const failingNodes = await prisma.node.findMany({
    where: {
      upkeepStatus: {
        in: ['WARNING', 'DECAY', 'COLLAPSE'],
      },
      ownerId: { not: null },
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

  for (const node of failingNodes) {
    const lastPaid = node.upkeepPaid ?? now;
    const hoursSincePayment = (now.getTime() - lastPaid.getTime()) / (1000 * 60 * 60);
    const currentStatus = getUpkeepStatus(hoursSincePayment);

    // Check for abandonment (48h+)
    if (currentStatus === 'ABANDONED') {
      // Node reverts to neutral
      await prisma.node.update({
        where: { id: node.id },
        data: {
          ownerId: null,
          status: 'NEUTRAL',
          upkeepStatus: 'PAID',
          upkeepPaid: null,
          upkeepDue: null,
          claimedAt: null,
        },
      });

      // Publish abandonment event
      await publisherRedis.publish(
        'node:abandoned',
        JSON.stringify({
          nodeId: node.id,
          reason: 'upkeep_failure',
          timestamp: now.toISOString(),
        })
      );

      console.log(`[Upkeep] Node ${node.id} abandoned due to upkeep failure`);
      continue;
    }

    // Apply decay damage to buildings
    const damagePercent = getDecayDamagePercent(hoursSincePayment);
    if (damagePercent > 0 && node.buildings.length > 0) {
      const buildingUpdates = node.buildings.map((building) => {
        const damage = Math.floor(building.maxHealth * (damagePercent / 100));
        const newHealth = Math.max(0, building.health - damage);

        return prisma.building.update({
          where: { id: building.id },
          data: { health: newHealth },
        });
      });

      await prisma.$transaction(buildingUpdates);
    }

    // Update status if changed
    if (currentStatus !== node.upkeepStatus) {
      await prisma.node.update({
        where: { id: node.id },
        data: { upkeepStatus: currentStatus },
      });
    }
  }
}
