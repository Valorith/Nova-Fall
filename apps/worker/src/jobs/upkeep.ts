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

    // Fetch only connections relevant to owned nodes (not ALL connections)
    const allOwnedNodeIds = players.flatMap((p) => p.ownedNodes.map((n) => n.id));
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

      // Update node upkeep status - OPTIMIZED: batch by status type
      const nextDue = new Date(now.getTime() + 60 * 60 * 1000); // +1 hour

      if (paid) {
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

        for (const node of player.ownedNodes) {
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

  // OPTIMIZED: Collect all updates, execute in batches at the end
  const abandonedNodeIds: string[] = [];
  const statusUpdates = new Map<string, string[]>(); // status -> nodeIds
  const allBuildingUpdates: Array<{ id: string; newHealth: number }> = [];

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
