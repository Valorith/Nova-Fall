/**
 * Combat Simulator
 *
 * Processes combat simulation ticks for a battle.
 * Handles:
 * - Unit movement using flow field
 * - Target acquisition
 * - Attack processing
 * - Core damage
 * - Death handling
 */

import type { UnitStats } from '@nova-fall/shared';
import { UnitState } from '@nova-fall/shared';
import {
  applyDamage,
  findNearestTarget,
  isInRange,
  attackCooldownMs,
} from './damage.js';

/**
 * Unit state in the simulation
 */
export interface SimUnit {
  id: string;
  typeId: string;
  ownerId: string;
  x: number;
  z: number;
  targetX: number | null;
  targetZ: number | null;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  stats: UnitStats;
  state: UnitState;
  targetId: string | null;
  lastAttackTime: number;
  rotation: number;
}

/**
 * Building state in the simulation
 */
export interface SimBuilding {
  id: string;
  typeId: string;
  ownerId: string;
  x: number;
  z: number;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  damage: number;
  armor: number;
  range: number;
  attackSpeed: number;
  lastAttackTime: number;
  targetId: string | null;
}

/**
 * Core (HQ) state in the simulation
 */
export interface SimCore {
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
}

/**
 * Combat event types for logging/visualization
 */
export type CombatEvent =
  | { type: 'attack'; attackerId: string; targetId: string; damage: number }
  | { type: 'death'; unitId: string }
  | { type: 'coreDamage'; damage: number; attackerId: string }
  | { type: 'spawn'; unitId: string; x: number; z: number };

/**
 * Direction lookup for flow field (matching FlowField.ts)
 */
const DIRECTIONS = [
  { dx: 0, dz: -1 }, // North
  { dx: 1, dz: -1 }, // NE
  { dx: 1, dz: 0 }, // East
  { dx: 1, dz: 1 }, // SE
  { dx: 0, dz: 1 }, // South
  { dx: -1, dz: 1 }, // SW
  { dx: -1, dz: 0 }, // West
  { dx: -1, dz: -1 }, // NW
];

/**
 * Flow field data for pathfinding
 */
export interface FlowFieldData {
  width: number;
  height: number;
  distances: number[][];
  directions: number[][];
}

/**
 * Combat simulation state
 */
export interface CombatSimState {
  battleId: string;
  attackerId: string;
  defenderId: string;
  units: Map<string, SimUnit>;
  buildings: Map<string, SimBuilding>;
  core: SimCore;
  flowField: FlowFieldData;
  currentTime: number;
  events: CombatEvent[];
  isComplete: boolean;
  winnerId: string | null;
}

/**
 * Arena size constants (must match client)
 */
const ARENA_SIZE = 60;
const CORE_X = Math.floor(ARENA_SIZE / 2);
const CORE_Z = Math.floor(ARENA_SIZE / 2);

/**
 * Combat simulator class
 */
export class CombatSimulator {
  private state: CombatSimState;

  constructor(
    battleId: string,
    attackerId: string,
    defenderId: string,
    flowField: FlowFieldData,
    coreMaxHealth: number
  ) {
    this.state = {
      battleId,
      attackerId,
      defenderId,
      units: new Map(),
      buildings: new Map(),
      core: {
        health: coreMaxHealth,
        maxHealth: coreMaxHealth,
        shield: 0,
        maxShield: 0,
      },
      flowField,
      currentTime: 0,
      events: [],
      isComplete: false,
      winnerId: null,
    };
  }

  /**
   * Get current simulation state
   */
  getState(): CombatSimState {
    return this.state;
  }

  /**
   * Add a unit to the simulation
   */
  addUnit(unit: SimUnit): void {
    this.state.units.set(unit.id, unit);
    this.state.events.push({
      type: 'spawn',
      unitId: unit.id,
      x: unit.x,
      z: unit.z,
    });
  }

  /**
   * Add a building to the simulation
   */
  addBuilding(building: SimBuilding): void {
    this.state.buildings.set(building.id, building);
  }

  /**
   * Process a single simulation tick
   * @param deltaMs Time since last tick in milliseconds
   */
  tick(deltaMs: number): CombatEvent[] {
    if (this.state.isComplete) return [];

    this.state.currentTime += deltaMs;
    this.state.events = [];

    // Process attacker units (move toward core, attack defenders/core)
    this.processAttackerUnits(deltaMs);

    // Process defender units (attack attackers)
    this.processDefenderUnits();

    // Process turrets (buildings that can attack)
    this.processTurrets();

    // Check win conditions
    this.checkWinConditions();

    return this.state.events;
  }

  /**
   * Process attacker units - they move toward the core
   */
  private processAttackerUnits(deltaMs: number): void {
    const attackerUnits = Array.from(this.state.units.values()).filter(
      u => u.ownerId === this.state.attackerId && u.state !== UnitState.DEAD
    );

    const defenderUnits = Array.from(this.state.units.values()).filter(
      u => u.ownerId === this.state.defenderId && u.state !== UnitState.DEAD
    );

    for (const unit of attackerUnits) {
      // Skip spawning units
      if (unit.state === UnitState.SPAWNING) continue;

      // Find nearby defender to attack
      const targetIdx = findNearestTarget(
        unit.x,
        unit.z,
        defenderUnits.map(u => ({ x: u.x, z: u.z })),
        unit.stats.range
      );

      if (targetIdx >= 0) {
        // Attack defender
        const target = defenderUnits[targetIdx];
        if (target) {
          this.processUnitAttack(unit, target);
        }
      } else if (this.isAtCore(unit.x, unit.z, unit.stats.range)) {
        // Attack core
        this.processCoreDamage(unit);
      } else {
        // Move toward core using flow field
        this.moveUnitWithFlowField(unit, deltaMs);
      }
    }
  }

  /**
   * Process defender units - they attack attackers
   */
  private processDefenderUnits(): void {
    const defenderUnits = Array.from(this.state.units.values()).filter(
      u => u.ownerId === this.state.defenderId && u.state !== UnitState.DEAD
    );

    const attackerUnits = Array.from(this.state.units.values()).filter(
      u => u.ownerId === this.state.attackerId && u.state !== UnitState.DEAD
    );

    for (const unit of defenderUnits) {
      if (unit.state === UnitState.SPAWNING) continue;

      // Find nearby attacker to attack
      const targetIdx = findNearestTarget(
        unit.x,
        unit.z,
        attackerUnits.map(u => ({ x: u.x, z: u.z })),
        unit.stats.range
      );

      if (targetIdx >= 0) {
        const target = attackerUnits[targetIdx];
        if (target) {
          this.processUnitAttack(unit, target);
        }
      }
      // Defenders don't move toward enemies for now (they hold position)
    }
  }

  /**
   * Process turret attacks
   */
  private processTurrets(): void {
    const attackerUnits = Array.from(this.state.units.values()).filter(
      u => u.ownerId === this.state.attackerId && u.state !== UnitState.DEAD
    );

    for (const turret of this.state.buildings.values()) {
      // Only process turrets (buildings with attack capability)
      if (turret.attackSpeed <= 0) continue;

      // Find target
      const targetIdx = findNearestTarget(
        turret.x,
        turret.z,
        attackerUnits.map(u => ({ x: u.x, z: u.z })),
        turret.range
      );

      if (targetIdx >= 0) {
        const target = attackerUnits[targetIdx];
        if (target) {
          this.processTurretAttack(turret, target);
        }
      }
    }
  }

  /**
   * Process unit attacking another unit
   */
  private processUnitAttack(attacker: SimUnit, target: SimUnit): void {
    const cooldown = attackCooldownMs(attacker.stats.attackSpeed);
    if (this.state.currentTime - attacker.lastAttackTime < cooldown) {
      return;
    }

    // Apply damage
    const result = applyDamage(
      attacker.stats.damage,
      target.stats.armor,
      target.shield,
      target.health
    );

    target.shield = result.shieldRemaining;
    target.health = result.healthRemaining;
    attacker.lastAttackTime = this.state.currentTime;
    attacker.state = UnitState.ATTACKING;
    attacker.targetId = target.id;

    // Face the target
    attacker.rotation = Math.atan2(target.x - attacker.x, target.z - attacker.z);

    this.state.events.push({
      type: 'attack',
      attackerId: attacker.id,
      targetId: target.id,
      damage: result.healthDamage + result.shieldDamage,
    });

    if (result.isDead) {
      target.state = UnitState.DEAD;
      this.state.events.push({ type: 'death', unitId: target.id });
    }
  }

  /**
   * Process turret attacking a unit
   */
  private processTurretAttack(turret: SimBuilding, target: SimUnit): void {
    const cooldown = attackCooldownMs(turret.attackSpeed);
    if (this.state.currentTime - turret.lastAttackTime < cooldown) {
      return;
    }

    const result = applyDamage(
      turret.damage,
      target.stats.armor,
      target.shield,
      target.health
    );

    target.shield = result.shieldRemaining;
    target.health = result.healthRemaining;
    turret.lastAttackTime = this.state.currentTime;

    this.state.events.push({
      type: 'attack',
      attackerId: turret.id,
      targetId: target.id,
      damage: result.healthDamage + result.shieldDamage,
    });

    if (result.isDead) {
      target.state = UnitState.DEAD;
      this.state.events.push({ type: 'death', unitId: target.id });
    }
  }

  /**
   * Process unit damaging the core
   */
  private processCoreDamage(attacker: SimUnit): void {
    const cooldown = attackCooldownMs(attacker.stats.attackSpeed);
    if (this.state.currentTime - attacker.lastAttackTime < cooldown) {
      return;
    }

    // Core has no armor for simplicity
    const result = applyDamage(
      attacker.stats.damage,
      0,
      this.state.core.shield,
      this.state.core.health
    );

    this.state.core.shield = result.shieldRemaining;
    this.state.core.health = result.healthRemaining;
    attacker.lastAttackTime = this.state.currentTime;
    attacker.state = UnitState.ATTACKING;
    attacker.targetId = 'core';

    this.state.events.push({
      type: 'coreDamage',
      damage: result.healthDamage + result.shieldDamage,
      attackerId: attacker.id,
    });
  }

  /**
   * Check if a position is at the core (within attack range)
   */
  private isAtCore(x: number, z: number, range: number): boolean {
    // Core occupies 2x2 tiles at center
    return isInRange(x, z, CORE_X, CORE_Z, range) ||
           isInRange(x, z, CORE_X + 1, CORE_Z, range) ||
           isInRange(x, z, CORE_X, CORE_Z + 1, range) ||
           isInRange(x, z, CORE_X + 1, CORE_Z + 1, range);
  }

  /**
   * Move unit using flow field
   */
  private moveUnitWithFlowField(unit: SimUnit, deltaMs: number): void {
    const gridX = Math.floor(unit.x);
    const gridZ = Math.floor(unit.z);

    // Get direction from flow field
    const dirIdx = this.state.flowField.directions[gridX]?.[gridZ];
    if (dirIdx === undefined || dirIdx < 0) return;

    const dir = DIRECTIONS[dirIdx];
    if (!dir) return;

    // Calculate movement
    const speed = unit.stats.speed; // tiles per minute
    const tilesPerMs = speed / 60000;
    const moveDistance = tilesPerMs * deltaMs;

    // Update position
    unit.x += dir.dx * moveDistance;
    unit.z += dir.dz * moveDistance;

    // Set target position for client interpolation
    unit.targetX = unit.x;
    unit.targetZ = unit.z;

    // Update rotation to face movement direction
    unit.rotation = Math.atan2(dir.dx, dir.dz);
    unit.state = UnitState.MOVING;
  }

  /**
   * Check win conditions
   */
  private checkWinConditions(): void {
    // Core destroyed = attacker wins
    if (this.state.core.health <= 0) {
      this.state.isComplete = true;
      this.state.winnerId = this.state.attackerId;
      return;
    }

    // All attacker units dead = defender wins
    const aliveAttackers = Array.from(this.state.units.values()).filter(
      u => u.ownerId === this.state.attackerId && u.state !== UnitState.DEAD
    );

    if (aliveAttackers.length === 0) {
      this.state.isComplete = true;
      this.state.winnerId = this.state.defenderId;
    }
  }

  /**
   * Get units in client-friendly format
   */
  getClientUnits(): {
    id: string;
    typeId: string;
    ownerId: string;
    position: { x: number; z: number };
    targetPosition: { x: number; z: number } | null;
    health: number;
    maxHealth: number;
    shield: number;
    maxShield: number;
    state: UnitState;
    rotation: number;
  }[] {
    return Array.from(this.state.units.values()).map(u => ({
      id: u.id,
      typeId: u.typeId,
      ownerId: u.ownerId,
      position: { x: u.x, z: u.z },
      targetPosition: u.targetX !== null ? { x: u.targetX, z: u.targetZ ?? u.z } : null,
      health: u.health,
      maxHealth: u.maxHealth,
      shield: u.shield,
      maxShield: u.maxShield,
      state: u.state,
      rotation: u.rotation,
    }));
  }

  /**
   * Get core health info
   */
  getCoreHealth(): { health: number; maxHealth: number } {
    return {
      health: this.state.core.health,
      maxHealth: this.state.core.maxHealth,
    };
  }
}
