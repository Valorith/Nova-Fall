/**
 * Combat damage calculation module
 *
 * Handles damage calculations for units and buildings in combat.
 * Supports:
 * - Armor damage reduction
 * - Shield absorption
 * - AOE shield protection
 */

import type { UnitStats } from '@nova-fall/shared';

/**
 * Calculate damage after armor reduction
 * Formula: damage * (100 / (100 + armor))
 * This gives diminishing returns on armor
 */
export function calculateDamageAfterArmor(damage: number, armor: number): number {
  if (armor <= 0) return damage;
  const reduction = 100 / (100 + armor);
  return Math.floor(damage * reduction);
}

/**
 * Result of applying damage to a target
 */
export interface DamageResult {
  shieldDamage: number; // Damage absorbed by shield
  healthDamage: number; // Damage to health
  shieldRemaining: number; // Remaining shield
  healthRemaining: number; // Remaining health
  isDead: boolean; // Whether the target is dead
  overkill: number; // Excess damage beyond death
}

/**
 * Apply damage to a target with shield and health
 * Shields absorb damage before health
 */
export function applyDamage(
  rawDamage: number,
  armor: number,
  currentShield: number,
  currentHealth: number
): DamageResult {
  // Calculate damage after armor
  const effectiveDamage = calculateDamageAfterArmor(rawDamage, armor);

  let remainingDamage = effectiveDamage;
  let shieldDamage = 0;
  let healthDamage = 0;

  // Shield absorbs damage first
  if (currentShield > 0) {
    shieldDamage = Math.min(currentShield, remainingDamage);
    remainingDamage -= shieldDamage;
  }

  // Remaining damage goes to health
  healthDamage = Math.min(currentHealth, remainingDamage);
  remainingDamage -= healthDamage;

  const shieldRemaining = currentShield - shieldDamage;
  const healthRemaining = currentHealth - healthDamage;

  return {
    shieldDamage,
    healthDamage,
    shieldRemaining,
    healthRemaining,
    isDead: healthRemaining <= 0,
    overkill: remainingDamage,
  };
}

/**
 * Calculate if a unit can attack another unit based on range
 * Uses grid distance (Chebyshev distance for diagonal movement)
 */
export function isInRange(
  attackerX: number,
  attackerZ: number,
  targetX: number,
  targetZ: number,
  range: number
): boolean {
  const dx = Math.abs(targetX - attackerX);
  const dz = Math.abs(targetZ - attackerZ);
  // Chebyshev distance (allows diagonal)
  const distance = Math.max(dx, dz);
  return distance <= range;
}

/**
 * Calculate Euclidean distance between two points (for sorting)
 */
export function euclideanDistance(
  x1: number,
  z1: number,
  x2: number,
  z2: number
): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Find the nearest target from a list of positions
 * Returns the index of the nearest target, or -1 if none in range
 */
export function findNearestTarget(
  attackerX: number,
  attackerZ: number,
  targets: { x: number; z: number }[],
  maxRange: number
): number {
  let nearestIndex = -1;
  let nearestDistance = Infinity;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (!target) continue;

    const distance = euclideanDistance(attackerX, attackerZ, target.x, target.z);
    if (distance <= maxRange && distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = i;
    }
  }

  return nearestIndex;
}

/**
 * Calculate attack cooldown in milliseconds from attack speed
 */
export function attackCooldownMs(attackSpeed: number): number {
  if (attackSpeed <= 0) return Infinity;
  return Math.floor(1000 / attackSpeed);
}

/**
 * Combat state for a single unit
 */
export interface UnitCombatState {
  id: string;
  x: number;
  z: number;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  stats: UnitStats;
  lastAttackTime: number;
  targetId: string | null;
  ownerId: string;
}

/**
 * Process a single attack between attacker and target
 * Returns the damage result
 */
export function processAttack(
  attacker: UnitCombatState,
  target: UnitCombatState,
  currentTime: number
): DamageResult | null {
  // Check if attacker can attack (cooldown)
  const cooldown = attackCooldownMs(attacker.stats.attackSpeed);
  if (currentTime - attacker.lastAttackTime < cooldown) {
    return null;
  }

  // Check range
  if (!isInRange(attacker.x, attacker.z, target.x, target.z, attacker.stats.range)) {
    return null;
  }

  // Apply damage
  const result = applyDamage(
    attacker.stats.damage,
    target.stats.armor,
    target.shield,
    target.health
  );

  return result;
}
