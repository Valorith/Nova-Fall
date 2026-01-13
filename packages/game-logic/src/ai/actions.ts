/**
 * Behavior Tree Action Executors
 * Each function returns an action result that the simulator will execute
 */

import type { AIContext } from '@nova-fall/shared';

type ActionParams = Record<string, unknown>;

/**
 * Result of an action execution
 * The simulator will interpret this and perform the actual action
 */
export interface ActionResult {
  type: 'attack' | 'move' | 'set_target' | 'clear_target' | 'hold';
  targetId?: string;
  targetX?: number;
  targetZ?: number;
  moveX?: number;
  moveZ?: number;
}

/**
 * Execute an action by ID
 */
export function executeAction(
  actionId: string,
  params: ActionParams,
  context: AIContext
): ActionResult | null {
  const executor = ACTION_EXECUTORS[actionId];
  if (!executor) {
    return null;
  }
  return executor(params, context);
}

/**
 * Helper: Calculate squared distance between two points (faster than distance)
 */
function distanceSq(x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return dx * dx + dz * dz;
}

/**
 * Helper: Find the nearest enemy matching a filter
 */
function findNearestEnemy(
  context: AIContext,
  filter: string = 'any'
): { id: string; x: number; z: number } | null {
  let nearestId: string | null = null;
  let nearestX = 0;
  let nearestZ = 0;
  let nearestDistSq = Infinity;

  for (const enemy of context.enemies) {
    // Apply filter
    if (filter === 'unit' && enemy.isBuilding) continue;
    if (filter === 'building' && !enemy.isBuilding) continue;
    if (filter === 'turret' && (!enemy.isBuilding || enemy.type !== 'turret')) continue;

    const distSq = distanceSq(context.unit.x, context.unit.z, enemy.x, enemy.z);
    if (distSq < nearestDistSq) {
      nearestId = enemy.id;
      nearestX = enemy.x;
      nearestZ = enemy.z;
      nearestDistSq = distSq;
    }
  }

  return nearestId ? { id: nearestId, x: nearestX, z: nearestZ } : null;
}

/**
 * Helper: Find enemy with lowest health (in range)
 */
function findLowestHealthEnemy(context: AIContext): { id: string; x: number; z: number } | null {
  const maxRange = context.unit.stats.range * 1.5;
  const maxRangeSq = maxRange * maxRange;

  let lowestId: string | null = null;
  let lowestX = 0;
  let lowestZ = 0;
  let lowestHealthPercent = Infinity;

  for (const enemy of context.enemies) {
    const distSq = distanceSq(context.unit.x, context.unit.z, enemy.x, enemy.z);
    if (distSq > maxRangeSq) continue; // Only consider enemies somewhat nearby

    const healthPercent = enemy.health / enemy.maxHealth;
    if (healthPercent < lowestHealthPercent) {
      lowestId = enemy.id;
      lowestX = enemy.x;
      lowestZ = enemy.z;
      lowestHealthPercent = healthPercent;
    }
  }

  return lowestId ? { id: lowestId, x: lowestX, z: lowestZ } : null;
}

/**
 * Helper: Find enemy by current target ID
 */
function findEnemy(context: AIContext, id: string) {
  return context.enemies.find((e) => e.id === id);
}

/**
 * Helper: Find ally with lowest health
 */
function findLowestHealthAlly(
  context: AIContext,
  radius: number
): { id: string; x: number; z: number } | null {
  const radiusSq = radius * radius;

  let lowestId: string | null = null;
  let lowestX = 0;
  let lowestZ = 0;
  let lowestHealthPercent = Infinity;

  for (const ally of context.allies) {
    if (ally.id === context.unit.id) continue;

    const distSq = distanceSq(context.unit.x, context.unit.z, ally.x, ally.z);
    if (distSq > radiusSq) continue;

    const healthPercent = ally.health / ally.maxHealth;
    if (healthPercent < lowestHealthPercent) {
      lowestId = ally.id;
      lowestX = ally.x;
      lowestZ = ally.z;
      lowestHealthPercent = healthPercent;
    }
  }

  return lowestId ? { id: lowestId, x: lowestX, z: lowestZ } : null;
}

// ==================== ACTION EXECUTORS ====================

const ACTION_EXECUTORS: Record<
  string,
  (params: ActionParams, context: AIContext) => ActionResult | null
> = {
  // ==================== COMBAT ACTIONS ====================

  /**
   * Attack the current target
   */
  attack_target: (_params, context) => {
    if (!context.unit.targetId) return null;

    // Special handling for core target
    if (context.unit.targetId === 'core') {
      return {
        type: 'attack',
        targetId: 'core',
        targetX: context.core.x,
        targetZ: context.core.z,
      };
    }

    const target = findEnemy(context, context.unit.targetId);
    if (!target) return null;

    return {
      type: 'attack',
      targetId: target.id,
      targetX: target.x,
      targetZ: target.z,
    };
  },

  /**
   * Attack the nearest enemy matching filter
   */
  attack_nearest: (params, context) => {
    const filter = (params.filter as string) || 'any';
    const target = findNearestEnemy(context, filter);
    if (!target) return null;

    return {
      type: 'attack',
      targetId: target.id,
      targetX: target.x,
      targetZ: target.z,
    };
  },

  /**
   * Attack based on priority list
   */
  attack_priority: (params, context) => {
    const priority1 = (params.priority_1 as string) || 'lowest_health';
    const priority2 = (params.priority_2 as string) || 'closest';

    const maxRange = context.unit.stats.range * 1.5;
    const maxRangeSq = maxRange * maxRange;

    // Get all enemies in range
    const enemiesInRange = context.enemies.filter((enemy) => {
      const distSq = distanceSq(context.unit.x, context.unit.z, enemy.x, enemy.z);
      return distSq <= maxRangeSq;
    });

    if (enemiesInRange.length === 0) return null;

    // Sort by priority (using squared distance for 'closest' preserves ordering)
    const sorted = [...enemiesInRange].sort((a, b) => {
      const scoreFn = (priority: string, enemy: typeof a) => {
        switch (priority) {
          case 'lowest_health':
            return enemy.health / enemy.maxHealth;
          case 'highest_health':
            return -(enemy.health / enemy.maxHealth);
          case 'closest':
            return distanceSq(context.unit.x, context.unit.z, enemy.x, enemy.z);
          case 'turrets':
            return enemy.isBuilding && enemy.type === 'turret' ? -1 : 1;
          case 'support':
            return enemy.type === 'support' ? -1 : 1;
          default:
            return 0;
        }
      };

      const scoreA1 = scoreFn(priority1, a);
      const scoreB1 = scoreFn(priority1, b);

      if (scoreA1 !== scoreB1) return scoreA1 - scoreB1;

      // Tiebreaker
      const scoreA2 = scoreFn(priority2, a);
      const scoreB2 = scoreFn(priority2, b);
      return scoreA2 - scoreB2;
    });

    const target = sorted[0];
    if (!target) return null;

    return {
      type: 'attack',
      targetId: target.id,
      targetX: target.x,
      targetZ: target.z,
    };
  },

  // ==================== TARGETING ACTIONS ====================

  /**
   * Select a new target
   */
  set_target: (params, context) => {
    const filter = (params.filter as string) || 'nearest';

    let target: { id: string; x: number; z: number } | null = null;

    switch (filter) {
      case 'nearest':
        target = findNearestEnemy(context);
        break;
      case 'lowest_health':
        target = findLowestHealthEnemy(context);
        break;
      case 'buildings':
        target = findNearestEnemy(context, 'building');
        break;
      case 'core':
        // Target the core directly
        return {
          type: 'set_target',
          targetId: 'core',
          targetX: context.core.x,
          targetZ: context.core.z,
        };
      default:
        target = findNearestEnemy(context);
    }

    if (!target) return null;

    return {
      type: 'set_target',
      targetId: target.id,
      targetX: target.x,
      targetZ: target.z,
    };
  },

  /**
   * Clear current target
   */
  clear_target: (_params, _context) => {
    return { type: 'clear_target' };
  },

  // ==================== MOVEMENT ACTIONS ====================

  /**
   * Move toward current target
   */
  move_to_target: (_params, context) => {
    if (!context.unit.targetId) return null;

    // Special handling for core target
    if (context.unit.targetId === 'core') {
      return {
        type: 'move',
        moveX: context.core.x,
        moveZ: context.core.z,
      };
    }

    const target = findEnemy(context, context.unit.targetId);
    if (!target) return null;

    return {
      type: 'move',
      moveX: target.x,
      moveZ: target.z,
    };
  },

  /**
   * Move to specific position
   */
  move_to_position: (params, _context) => {
    const x = (params.x as number) ?? 30;
    const z = (params.z as number) ?? 30;

    return {
      type: 'move',
      moveX: x,
      moveZ: z,
    };
  },

  /**
   * Follow the flow field toward the core
   */
  follow_flow_field: (_params, context) => {
    const direction = context.flowField.getDirection(context.unit.x, context.unit.z);
    if (!direction) {
      // Fallback: move toward core directly
      return {
        type: 'move',
        moveX: context.core.x,
        moveZ: context.core.z,
      };
    }

    // Move one step in the flow direction
    return {
      type: 'move',
      moveX: context.unit.x + direction.dx,
      moveZ: context.unit.z + direction.dz,
    };
  },

  /**
   * Retreat to spawn area
   */
  retreat_to_spawn: (_params, context) => {
    // Move toward spawn (z = 0 for attackers)
    return {
      type: 'move',
      moveX: context.unit.x,
      moveZ: 0,
    };
  },

  /**
   * Stop moving, hold current position
   */
  hold_position: (_params, _context) => {
    return { type: 'hold' };
  },

  // ==================== SUPPORT ACTIONS ====================

  /**
   * Move to protect a nearby ally
   */
  protect_ally: (params, context) => {
    const filter = (params.filter as string) || 'lowest_health';
    const radius = (params.radius as number) ?? 10;
    const radiusSq = radius * radius;

    let targetAlly: { id: string; x: number; z: number } | null = null;

    switch (filter) {
      case 'lowest_health':
        targetAlly = findLowestHealthAlly(context, radius);
        break;
      case 'nearest': {
        // Find nearest ally
        let nearestId: string | null = null;
        let nearestX = 0;
        let nearestZ = 0;
        let nearestDistSq = Infinity;
        for (const ally of context.allies) {
          if (ally.id === context.unit.id) continue;
          const distSq = distanceSq(context.unit.x, context.unit.z, ally.x, ally.z);
          if (distSq > radiusSq) continue;
          if (distSq < nearestDistSq) {
            nearestId = ally.id;
            nearestX = ally.x;
            nearestZ = ally.z;
            nearestDistSq = distSq;
          }
        }
        targetAlly = nearestId ? { id: nearestId, x: nearestX, z: nearestZ } : null;
        break;
      }
      default:
        targetAlly = findLowestHealthAlly(context, radius);
    }

    if (!targetAlly) return null;

    // Move toward the ally
    return {
      type: 'move',
      moveX: targetAlly.x,
      moveZ: targetAlly.z,
    };
  },
};

export { ACTION_EXECUTORS };
