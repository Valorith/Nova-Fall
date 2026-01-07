// Upkeep calculation and failure state logic
import type {
  NodeType} from '@nova-fall/shared';
import {
  NODE_BASE_UPKEEP,
  DISTANCE_UPKEEP_MODIFIER,
  UpkeepStatus,
} from '@nova-fall/shared';

// Upkeep failure phase durations (in hours)
export const UPKEEP_PHASE_HOURS = {
  WARNING: 12,   // 0-12h: warning phase
  DECAY: 24,     // 12-36h: decay phase (24h duration, starts at 12h)
  COLLAPSE: 12,  // 36-48h: collapse phase (12h duration, starts at 36h)
  // After 48h: abandoned
};

// Building upkeep costs (per building type)
export const BUILDING_UPKEEP: Record<string, number> = {
  TURRET: 10,
  WALL: 5,
  FACTORY: 15,
  STORAGE: 8,
  GENERATOR: 12,
  BARRACKS: 20,
  RESEARCH_LAB: 25,
};

export interface NodeUpkeepInput {
  type: NodeType;
  tier: number;
  distanceFromHQ: number;
  regionUpkeepModifier?: number;
  buildings?: { typeId: string }[];
}

export interface UpkeepBreakdown {
  base: number;
  tierMultiplier: number;
  distanceMultiplier: number;
  regionMultiplier: number;
  buildingCost: number;
  total: number;
}

/**
 * Calculate total upkeep cost for a node
 */
export function calculateNodeUpkeep(input: NodeUpkeepInput): UpkeepBreakdown {
  const { type, tier, distanceFromHQ, regionUpkeepModifier = 1.0, buildings = [] } = input;

  // Base upkeep from node type
  const base = NODE_BASE_UPKEEP[type] ?? 50;

  // Tier multiplier (higher tier = more upkeep)
  const tierMultiplier = 1 + (tier - 1) * 0.25; // Tier 1: 1.0, Tier 2: 1.25, Tier 3: 1.5

  // Distance modifier (15% per node from HQ)
  const distanceMultiplier = 1 + distanceFromHQ * DISTANCE_UPKEEP_MODIFIER;

  // Region modifier
  const regionMultiplier = regionUpkeepModifier;

  // Building upkeep (sum of all buildings)
  let buildingCost = 0;
  for (const building of buildings) {
    buildingCost += BUILDING_UPKEEP[building.typeId] ?? 0;
  }

  // Calculate total
  const nodeUpkeep = Math.floor(base * tierMultiplier * distanceMultiplier * regionMultiplier);
  const total = nodeUpkeep + buildingCost;

  return {
    base,
    tierMultiplier,
    distanceMultiplier,
    regionMultiplier,
    buildingCost,
    total,
  };
}

/**
 * Calculate total upkeep for all nodes owned by a player
 */
export function calculatePlayerTotalUpkeep(
  nodes: NodeUpkeepInput[]
): { perNode: Map<number, UpkeepBreakdown>; total: number } {
  const perNode = new Map<number, UpkeepBreakdown>();
  let total = 0;

  nodes.forEach((node, index) => {
    const breakdown = calculateNodeUpkeep(node);
    perNode.set(index, breakdown);
    total += breakdown.total;
  });

  return { perNode, total };
}

/**
 * Determine upkeep status based on hours since last payment
 */
export function getUpkeepStatus(hoursSinceLastPayment: number): UpkeepStatus {
  if (hoursSinceLastPayment <= 0) {
    return UpkeepStatus.PAID;
  }
  if (hoursSinceLastPayment <= UPKEEP_PHASE_HOURS.WARNING) {
    return UpkeepStatus.WARNING;
  }
  if (hoursSinceLastPayment <= UPKEEP_PHASE_HOURS.WARNING + UPKEEP_PHASE_HOURS.DECAY) {
    return UpkeepStatus.DECAY;
  }
  if (
    hoursSinceLastPayment <=
    UPKEEP_PHASE_HOURS.WARNING + UPKEEP_PHASE_HOURS.DECAY + UPKEEP_PHASE_HOURS.COLLAPSE
  ) {
    return UpkeepStatus.COLLAPSE;
  }
  return UpkeepStatus.ABANDONED;
}

/**
 * Calculate hours until next status change
 */
export function getHoursUntilNextPhase(hoursSinceLastPayment: number): number {
  if (hoursSinceLastPayment <= 0) {
    return 0; // Already paid
  }
  if (hoursSinceLastPayment < UPKEEP_PHASE_HOURS.WARNING) {
    return UPKEEP_PHASE_HOURS.WARNING - hoursSinceLastPayment;
  }
  if (hoursSinceLastPayment < UPKEEP_PHASE_HOURS.WARNING + UPKEEP_PHASE_HOURS.DECAY) {
    return UPKEEP_PHASE_HOURS.WARNING + UPKEEP_PHASE_HOURS.DECAY - hoursSinceLastPayment;
  }
  if (
    hoursSinceLastPayment <
    UPKEEP_PHASE_HOURS.WARNING + UPKEEP_PHASE_HOURS.DECAY + UPKEEP_PHASE_HOURS.COLLAPSE
  ) {
    return (
      UPKEEP_PHASE_HOURS.WARNING +
      UPKEEP_PHASE_HOURS.DECAY +
      UPKEEP_PHASE_HOURS.COLLAPSE -
      hoursSinceLastPayment
    );
  }
  return 0; // Already abandoned
}

/**
 * Calculate projected runway (hours until credits run out) based on current resources and upkeep
 */
export function calculateRunway(credits: number, hourlyUpkeep: number): number {
  if (hourlyUpkeep <= 0) return Infinity;
  return Math.floor(credits / hourlyUpkeep);
}

/**
 * Calculate decay damage percentage based on hours in decay/collapse phase
 */
export function getDecayDamagePercent(hoursSinceLastPayment: number): number {
  const status = getUpkeepStatus(hoursSinceLastPayment);

  if (status === UpkeepStatus.DECAY) {
    // 2% damage per hour during decay phase
    const hoursInDecay = hoursSinceLastPayment - UPKEEP_PHASE_HOURS.WARNING;
    return Math.min(hoursInDecay * 2, 48); // Cap at 48% during decay
  }

  if (status === UpkeepStatus.COLLAPSE) {
    // 5% damage per hour during collapse phase (plus accumulated decay damage)
    const hoursInCollapse =
      hoursSinceLastPayment - UPKEEP_PHASE_HOURS.WARNING - UPKEEP_PHASE_HOURS.DECAY;
    return 48 + Math.min(hoursInCollapse * 5, 52); // Total up to 100%
  }

  return 0;
}

/**
 * BFS to calculate distance (in nodes) from a node to the player's HQ
 */
export function calculateDistanceFromHQ(
  nodeId: string,
  hqNodeId: string,
  adjacencyMap: Map<string, string[]>
): number {
  if (nodeId === hqNodeId) return 0;

  const visited = new Set<string>();
  const queue: { nodeId: string; distance: number }[] = [{ nodeId: hqNodeId, distance: 0 }];
  visited.add(hqNodeId);

  while (queue.length > 0) {
    const current = queue.shift()!;

    const neighbors = adjacencyMap.get(current.nodeId) ?? [];
    for (const neighborId of neighbors) {
      if (neighborId === nodeId) {
        return current.distance + 1;
      }
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push({ nodeId: neighborId, distance: current.distance + 1 });
      }
    }
  }

  // Node not reachable from HQ (shouldn't happen in normal gameplay)
  return Infinity;
}

/**
 * Build adjacency map from owned nodes for distance calculation
 */
export function buildOwnedAdjacencyMap(
  ownedNodeIds: string[],
  connections: { fromNodeId: string; toNodeId: string }[]
): Map<string, string[]> {
  const ownedSet = new Set(ownedNodeIds);
  const adjacencyMap = new Map<string, string[]>();

  // Initialize all owned nodes
  for (const nodeId of ownedNodeIds) {
    adjacencyMap.set(nodeId, []);
  }

  // Add connections between owned nodes
  for (const conn of connections) {
    if (ownedSet.has(conn.fromNodeId) && ownedSet.has(conn.toNodeId)) {
      adjacencyMap.get(conn.fromNodeId)?.push(conn.toNodeId);
      adjacencyMap.get(conn.toNodeId)?.push(conn.fromNodeId);
    }
  }

  return adjacencyMap;
}
