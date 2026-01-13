/**
 * Behavior Tree Condition Evaluators
 * Each function evaluates a condition and returns true/false
 */

import type { AIContext } from '@nova-fall/shared';

type ConditionParams = Record<string, unknown>;

/**
 * Evaluate a condition by ID
 */
export function evaluateCondition(
  conditionId: string,
  params: ConditionParams,
  context: AIContext
): boolean {
  const evaluator = CONDITION_EVALUATORS[conditionId];
  if (!evaluator) {
    return false;
  }
  return evaluator(params, context);
}

/**
 * Helper: Compare values with operator
 */
function compare(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case '<':
      return value < threshold;
    case '<=':
      return value <= threshold;
    case '>':
      return value > threshold;
    case '>=':
      return value >= threshold;
    case '==':
      return value === threshold;
    default:
      return false;
  }
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
 * Helper: Find enemy by ID
 */
function findEnemy(context: AIContext, id: string) {
  return context.enemies.find((e: AIContext['enemies'][number]) => e.id === id);
}

// ==================== CONDITION EVALUATORS ====================

const CONDITION_EVALUATORS: Record<
  string,
  (params: ConditionParams, context: AIContext) => boolean
> = {
  // ==================== STATUS CONDITIONS ====================

  /**
   * Check unit health against threshold
   */
  health_check: (params, context) => {
    const operator = (params.operator as string) || '<';
    const value = (params.value as number) ?? 50;
    const type = (params.type as string) || 'percent';

    const { health, maxHealth } = context.unit;
    const checkValue = type === 'percent' ? (health / maxHealth) * 100 : health;

    return compare(checkValue, operator, value);
  },

  /**
   * Check unit shield against threshold
   */
  shield_check: (params, context) => {
    const operator = (params.operator as string) || '<';
    const value = (params.value as number) ?? 50;
    const type = (params.type as string) || 'percent';

    const { shield, maxShield } = context.unit;
    if (maxShield === 0) return false;

    const checkValue = type === 'percent' ? (shield / maxShield) * 100 : shield;
    return compare(checkValue, operator, value);
  },

  /**
   * Check if unit is in specific state
   */
  is_state: (params, context) => {
    const state = (params.state as string) || 'idle';
    return context.unit.state === state;
  },

  /**
   * Check if attack cooldown is ready
   * For now, always returns true (cooldown tracking would be in simulator)
   */
  cooldown_ready: (_params, _context) => {
    // In a full implementation, the context would include cooldown state
    return true;
  },

  // ==================== TARGETING CONDITIONS ====================

  /**
   * Check if unit has an active target
   */
  has_target: (_params, context) => {
    return context.unit.targetId !== null;
  },

  /**
   * Check if current target is within attack range
   */
  target_in_range: (params, context) => {
    const rangeMult = (params.range_mult as number) ?? 1.0;

    if (!context.unit.targetId) return false;

    // Special handling for core target
    if (context.unit.targetId === 'core') {
      const distSq = distanceSq(context.unit.x, context.unit.z, context.core.x, context.core.z);
      const effectiveRange = context.unit.stats.range * rangeMult;
      return distSq <= effectiveRange * effectiveRange;
    }

    const target = findEnemy(context, context.unit.targetId);
    if (!target) return false;

    const distSq = distanceSq(context.unit.x, context.unit.z, target.x, target.z);
    const effectiveRange = context.unit.stats.range * rangeMult;

    return distSq <= effectiveRange * effectiveRange;
  },

  /**
   * Check target's health
   */
  target_health: (params, context) => {
    const operator = (params.operator as string) || '<';
    const value = (params.value as number) ?? 50;

    if (!context.unit.targetId) return false;

    // Special handling for core target
    if (context.unit.targetId === 'core') {
      const healthPercent = (context.core.health / context.core.maxHealth) * 100;
      return compare(healthPercent, operator, value);
    }

    const target = findEnemy(context, context.unit.targetId);
    if (!target) return false;

    const healthPercent = (target.health / target.maxHealth) * 100;
    return compare(healthPercent, operator, value);
  },

  // ==================== AWARENESS CONDITIONS ====================

  /**
   * Check if any ally is within radius
   */
  ally_nearby: (params, context) => {
    const radius = (params.radius as number) ?? 5;
    const radiusSq = radius * radius;

    for (const ally of context.allies) {
      if (ally.id === context.unit.id) continue;
      const distSq = distanceSq(context.unit.x, context.unit.z, ally.x, ally.z);
      if (distSq <= radiusSq) {
        return true;
      }
    }
    return false;
  },

  /**
   * Check if any ally is below health threshold
   */
  ally_low_health: (params, context) => {
    const radius = (params.radius as number) ?? 10;
    const radiusSq = radius * radius;
    const threshold = (params.threshold as number) ?? 40;

    for (const ally of context.allies) {
      if (ally.id === context.unit.id) continue;

      const distSq = distanceSq(context.unit.x, context.unit.z, ally.x, ally.z);
      if (distSq > radiusSq) continue;

      const healthPercent = (ally.health / ally.maxHealth) * 100;
      if (healthPercent < threshold) {
        return true;
      }
    }
    return false;
  },

  /**
   * Count enemies within radius
   */
  enemy_count: (params, context) => {
    const operator = (params.operator as string) || '>';
    const value = (params.value as number) ?? 0;
    const radius = (params.radius as number) ?? 10;
    const radiusSq = radius * radius;

    let count = 0;
    for (const enemy of context.enemies) {
      const distSq = distanceSq(context.unit.x, context.unit.z, enemy.x, enemy.z);
      if (distSq <= radiusSq) {
        count++;
      }
    }

    return compare(count, operator, value);
  },

  /**
   * Check if specific enemy type is nearby
   */
  enemy_type_nearby: (params, context) => {
    const type = (params.type as string) || 'any';
    const radius = (params.radius as number) ?? 8;
    const radiusSq = radius * radius;

    for (const enemy of context.enemies) {
      const distSq = distanceSq(context.unit.x, context.unit.z, enemy.x, enemy.z);
      if (distSq > radiusSq) continue;

      if (type === 'any') return true;
      if (type === 'building' && enemy.isBuilding) return true;
      if (type === 'turret' && enemy.isBuilding && enemy.type === 'turret') return true;
      if (type === enemy.type) return true;
    }

    return false;
  },

  // ==================== POSITION CONDITIONS ====================

  /**
   * Check distance to enemy core
   */
  distance_to_core: (params, context) => {
    const operator = (params.operator as string) || '<';
    const value = (params.value as number) ?? 10;
    const valueSq = value * value;

    const distSq = distanceSq(
      context.unit.x,
      context.unit.z,
      context.core.x,
      context.core.z
    );

    // Compare squared values (works correctly for <, <=, >, >=)
    return compare(distSq, operator, valueSq);
  },

  /**
   * Check if unit is in spawn zone
   * Spawn zone is typically the edge of the arena (first few rows)
   */
  in_spawn_zone: (_params, context) => {
    // Assume spawn zone is z < 5 for attackers
    return context.unit.z < 5;
  },

  // ==================== UTILITY CONDITIONS ====================

  /**
   * Random chance (for adding unpredictability)
   */
  random_chance: (params, _context) => {
    const percent = (params.percent as number) ?? 50;
    return Math.random() * 100 < percent;
  },
};

export { CONDITION_EVALUATORS };
