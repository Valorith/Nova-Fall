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

import type { UnitStats, BehaviorTree, AIContext } from '@nova-fall/shared';
import { UnitState } from '@nova-fall/shared';
import {
  applyDamage,
  findNearestTarget,
  isInRange,
  attackCooldownMs,
} from './damage.js';
import { BehaviorTreeExecutor, type ActionResult } from '../ai/index.js';

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
  aiPreset?: BehaviorTree | null;
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
  aiPreset?: BehaviorTree | null;
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
/**
 * Cached data computed once per tick for performance
 */
interface TickCache {
  attackerUnits: SimUnit[];
  defenderUnits: SimUnit[];
  allBuildings: SimBuilding[];
  attackerBuildings: SimBuilding[];
  defenderBuildings: SimBuilding[];
}

/**
 * Reusable flow field wrapper to avoid allocations
 */
interface FlowFieldWrapper {
  getDirection: (x: number, z: number) => { dx: number; dz: number } | null;
  getDistance: (x: number, z: number) => number;
}

export class CombatSimulator {
  private state: CombatSimState;
  private executorCache = new Map<string, BehaviorTreeExecutor>();
  private tickCache: TickCache | null = null;
  private flowFieldWrapper: FlowFieldWrapper | null = null;

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
   * Get or create a behavior tree executor for a unit/building
   */
  private getExecutor(entityId: string, tree: BehaviorTree): BehaviorTreeExecutor {
    let executor = this.executorCache.get(entityId);
    if (!executor) {
      executor = new BehaviorTreeExecutor(tree);
      this.executorCache.set(entityId, executor);
    }
    return executor;
  }

  /**
   * Build tick cache - called once per tick to pre-compute unit/building lists
   */
  private buildTickCache(): TickCache {
    const allUnits = Array.from(this.state.units.values());
    const allBuildings = Array.from(this.state.buildings.values());

    return {
      attackerUnits: allUnits.filter(
        u => u.ownerId === this.state.attackerId && u.state !== UnitState.DEAD
      ),
      defenderUnits: allUnits.filter(
        u => u.ownerId === this.state.defenderId && u.state !== UnitState.DEAD
      ),
      allBuildings,
      attackerBuildings: allBuildings.filter(b => b.ownerId === this.state.attackerId),
      defenderBuildings: allBuildings.filter(b => b.ownerId === this.state.defenderId),
    };
  }

  /**
   * Get the reusable flow field wrapper
   */
  private getFlowFieldWrapper(): FlowFieldWrapper {
    if (!this.flowFieldWrapper) {
      const flowField = this.state.flowField;
      this.flowFieldWrapper = {
        getDirection: (x: number, z: number): { dx: number; dz: number } | null => {
          const gridX = Math.floor(x);
          const gridZ = Math.floor(z);
          const dirIdx = flowField.directions[gridX]?.[gridZ];
          if (dirIdx === undefined || dirIdx < 0) return null;
          return DIRECTIONS[dirIdx] || null;
        },
        getDistance: (x: number, z: number): number => {
          const gridX = Math.floor(x);
          const gridZ = Math.floor(z);
          return flowField.distances[gridX]?.[gridZ] ?? Infinity;
        },
      };
    }
    return this.flowFieldWrapper;
  }

  /**
   * Build AI context for a unit using tick cache
   */
  private buildUnitContext(unit: SimUnit): AIContext {
    if (!this.tickCache) throw new Error('Tick cache not initialized');
    const cache = this.tickCache;
    const isAttacker = unit.ownerId === this.state.attackerId;

    // Use cached lists based on team
    const enemyUnits = isAttacker ? cache.defenderUnits : cache.attackerUnits;
    const enemyBuildings = isAttacker ? cache.defenderBuildings : cache.attackerBuildings;
    const allyUnits = isAttacker ? cache.attackerUnits : cache.defenderUnits;

    // Build enemies array (units + buildings)
    const enemies: AIContext['enemies'] = [];
    for (const u of enemyUnits) {
      enemies.push({
        id: u.id,
        x: u.x,
        z: u.z,
        health: u.health,
        maxHealth: u.maxHealth,
        type: u.typeId,
        isBuilding: false,
      });
    }
    for (const b of enemyBuildings) {
      enemies.push({
        id: b.id,
        x: b.x,
        z: b.z,
        health: b.health,
        maxHealth: b.maxHealth,
        type: b.typeId,
        isBuilding: true,
      });
    }

    // Build allies array (excluding self)
    const allies: AIContext['allies'] = [];
    for (const u of allyUnits) {
      if (u.id === unit.id) continue;
      allies.push({
        id: u.id,
        x: u.x,
        z: u.z,
        health: u.health,
        maxHealth: u.maxHealth,
        type: u.typeId,
      });
    }

    // Build buildings array
    const buildings: AIContext['buildings'] = [];
    for (const b of cache.allBuildings) {
      buildings.push({
        id: b.id,
        x: b.x,
        z: b.z,
        health: b.health,
        maxHealth: b.maxHealth,
        type: b.typeId,
        isEnemy: b.ownerId !== unit.ownerId,
      });
    }

    return {
      unit: {
        id: unit.id,
        x: unit.x,
        z: unit.z,
        health: unit.health,
        maxHealth: unit.maxHealth,
        shield: unit.shield,
        maxShield: unit.maxShield,
        state: unit.state,
        targetId: unit.targetId,
        stats: {
          damage: unit.stats.damage,
          armor: unit.stats.armor,
          range: unit.stats.range,
          speed: unit.stats.speed,
          attackSpeed: unit.stats.attackSpeed,
        },
      },
      enemies,
      allies,
      buildings,
      core: {
        x: CORE_X,
        z: CORE_Z,
        health: this.state.core.health,
        maxHealth: this.state.core.maxHealth,
      },
      flowField: this.getFlowFieldWrapper(),
      currentTime: this.state.currentTime,
    };
  }

  /**
   * Build AI context for a building (turret) using tick cache
   */
  private buildBuildingContext(building: SimBuilding): AIContext {
    if (!this.tickCache) throw new Error('Tick cache not initialized');
    const cache = this.tickCache;
    const isAttacker = building.ownerId === this.state.attackerId;

    // Use cached lists based on team
    const enemyUnits = isAttacker ? cache.defenderUnits : cache.attackerUnits;

    // Build enemies array
    const enemies: AIContext['enemies'] = [];
    for (const u of enemyUnits) {
      enemies.push({
        id: u.id,
        x: u.x,
        z: u.z,
        health: u.health,
        maxHealth: u.maxHealth,
        type: u.typeId,
        isBuilding: false,
      });
    }

    // Build buildings array
    const buildings: AIContext['buildings'] = [];
    for (const b of cache.allBuildings) {
      buildings.push({
        id: b.id,
        x: b.x,
        z: b.z,
        health: b.health,
        maxHealth: b.maxHealth,
        type: b.typeId,
        isEnemy: b.ownerId !== building.ownerId,
      });
    }

    return {
      unit: {
        id: building.id,
        x: building.x,
        z: building.z,
        health: building.health,
        maxHealth: building.maxHealth,
        shield: building.shield,
        maxShield: building.maxShield,
        state: 'idle',
        targetId: building.targetId,
        stats: {
          damage: building.damage,
          armor: building.armor,
          range: building.range,
          speed: 0, // Buildings don't move
          attackSpeed: building.attackSpeed,
        },
      },
      enemies,
      allies: [], // Buildings don't have allies for now
      buildings,
      core: {
        x: CORE_X,
        z: CORE_Z,
        health: this.state.core.health,
        maxHealth: this.state.core.maxHealth,
      },
      flowField: this.getFlowFieldWrapper(), // Reuse flow field wrapper
      currentTime: this.state.currentTime,
    };
  }

  /**
   * Apply an action result to a unit
   */
  private applyUnitAction(unit: SimUnit, action: ActionResult, deltaMs: number): void {
    switch (action.type) {
      case 'attack': {
        // Attack specified target
        if (action.targetId === 'core') {
          // Attack the core
          this.processCoreDamage(unit);
        } else if (action.targetId) {
          const target = this.state.units.get(action.targetId);
          if (target && target.state !== UnitState.DEAD) {
            this.processUnitAttack(unit, target);
          }
        }
        break;
      }

      case 'move': {
        // Move toward specified position
        if (action.moveX !== undefined && action.moveZ !== undefined) {
          this.moveUnitToward(unit, action.moveX, action.moveZ, deltaMs);
        }
        break;
      }

      case 'set_target': {
        // Set the unit's current target
        unit.targetId = action.targetId ?? null;
        break;
      }

      case 'clear_target': {
        // Clear the unit's target
        unit.targetId = null;
        break;
      }

      case 'hold': {
        // Do nothing, hold position
        unit.state = UnitState.IDLE;
        break;
      }
    }
  }

  /**
   * Apply an action result to a building
   */
  private applyBuildingAction(building: SimBuilding, action: ActionResult): void {
    switch (action.type) {
      case 'attack': {
        // Attack specified target
        if (action.targetId) {
          const target = this.state.units.get(action.targetId);
          if (target && target.state !== UnitState.DEAD) {
            this.processTurretAttack(building, target);
          }
        }
        break;
      }

      case 'set_target': {
        building.targetId = action.targetId ?? null;
        break;
      }

      case 'clear_target': {
        building.targetId = null;
        break;
      }

      // Buildings ignore movement actions
      case 'move':
      case 'hold':
        break;
    }
  }

  /**
   * Move unit toward a position
   */
  private moveUnitToward(unit: SimUnit, targetX: number, targetZ: number, deltaMs: number): void {
    const dx = targetX - unit.x;
    const dz = targetZ - unit.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < 0.1) return; // Already at target

    // Normalize direction
    const dirX = dx / distance;
    const dirZ = dz / distance;

    // Calculate movement
    const speed = unit.stats.speed; // tiles per minute
    const tilesPerMs = speed / 60000;
    const moveDistance = Math.min(tilesPerMs * deltaMs, distance);

    // Update position
    unit.x += dirX * moveDistance;
    unit.z += dirZ * moveDistance;

    // Set target position for client interpolation
    unit.targetX = unit.x;
    unit.targetZ = unit.z;

    // Update rotation to face movement direction
    unit.rotation = Math.atan2(dirX, dirZ);
    unit.state = UnitState.MOVING;
  }

  /**
   * Process a single simulation tick
   * @param deltaMs Time since last tick in milliseconds
   */
  tick(deltaMs: number): CombatEvent[] {
    if (this.state.isComplete) return [];

    this.state.currentTime += deltaMs;
    this.state.events = [];

    // Build tick cache once per tick for performance
    this.tickCache = this.buildTickCache();

    // Process attacker units (move toward core, attack defenders/core)
    this.processAttackerUnits(deltaMs);

    // Process defender units (attack attackers)
    this.processDefenderUnits(deltaMs);

    // Process turrets (buildings that can attack)
    this.processTurrets();

    // Check win conditions
    this.checkWinConditions();

    // Clear tick cache
    this.tickCache = null;

    return this.state.events;
  }

  /**
   * Process attacker units - they move toward the core
   */
  private processAttackerUnits(deltaMs: number): void {
    if (!this.tickCache) return;
    const cache = this.tickCache;
    const attackerUnits = cache.attackerUnits;
    const defenderUnits = cache.defenderUnits;

    for (const unit of attackerUnits) {
      // Skip spawning units
      if (unit.state === UnitState.SPAWNING) continue;

      // Use behavior tree if available
      if (unit.aiPreset) {
        const executor = this.getExecutor(unit.id, unit.aiPreset);
        const context = this.buildUnitContext(unit);
        const result = executor.tick(context);

        if (result.action) {
          this.applyUnitAction(unit, result.action, deltaMs);
        }
        continue;
      }

      // Default behavior (fallback when no AI preset)
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
  private processDefenderUnits(deltaMs: number): void {
    if (!this.tickCache) return;
    const cache = this.tickCache;
    const defenderUnits = cache.defenderUnits;
    const attackerUnits = cache.attackerUnits;

    for (const unit of defenderUnits) {
      if (unit.state === UnitState.SPAWNING) continue;

      // Use behavior tree if available
      if (unit.aiPreset) {
        const executor = this.getExecutor(unit.id, unit.aiPreset);
        const context = this.buildUnitContext(unit);
        const result = executor.tick(context);

        if (result.action) {
          this.applyUnitAction(unit, result.action, deltaMs);
        }
        continue;
      }

      // Default behavior (fallback when no AI preset)
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
    if (!this.tickCache) return;
    const cache = this.tickCache;
    const attackerUnits = cache.attackerUnits;

    for (const turret of cache.allBuildings) {
      // Only process turrets (buildings with attack capability)
      if (turret.attackSpeed <= 0) continue;

      // Use behavior tree if available
      if (turret.aiPreset) {
        const executor = this.getExecutor(turret.id, turret.aiPreset);
        const context = this.buildBuildingContext(turret);
        const result = executor.tick(context);

        if (result.action) {
          this.applyBuildingAction(turret, result.action);
        }
        continue;
      }

      // Default behavior (fallback when no AI preset)
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
    // Use tick cache - already filtered to living units
    if (this.tickCache && this.tickCache.attackerUnits.length === 0) {
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
