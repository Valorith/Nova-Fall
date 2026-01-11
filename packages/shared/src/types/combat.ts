// Combat Mode Types
// These types define the data structures for real-time 3D combat

/**
 * Arena tile types that affect movement and visibility
 */
export enum TileType {
  WALKABLE = 'walkable', // Normal movement
  BLOCKED = 'blocked', // Impassable (walls, structures)
  SLOW = 'slow', // 50% movement speed
  HQ_ZONE = 'hq_zone', // HQ footprint
  SPAWN_ZONE = 'spawn_zone', // Attacker deployment area
  HAZARD = 'hazard', // Damage over time
}

/**
 * Unit behavior states in combat
 */
export enum UnitState {
  SPAWNING = 'spawning',
  IDLE = 'idle',
  MOVING = 'moving',
  ATTACKING = 'attacking',
  DEAD = 'dead',
}

/**
 * Combat phases during the 30-minute battle
 */
export enum CombatPhase {
  LOADING = 'loading', // Loading arena, syncing state
  DEPLOY = 'deploy', // Attacker deploying initial units
  BATTLE = 'battle', // Real-time combat
  RESOLVE = 'resolve', // Determining winner, transferring ownership
}

/**
 * Position in the combat arena (grid-based)
 */
export interface ArenaPosition {
  x: number; // 0-39 (grid column)
  z: number; // 0-39 (grid row)
}

/**
 * 3D position for visual rendering (meters)
 */
export interface WorldPosition {
  x: number;
  y: number; // Height
  z: number;
}

/**
 * Input commands sent from client to server
 */
export type CombatInputType = 'deploy' | 'move' | 'attack' | 'ability' | 'target_priority';

export interface CombatInput {
  type: CombatInputType;
  unitIds?: string[];
  targetId?: string;
  position?: ArenaPosition;
  abilityId?: string;
  timestamp: number;
}

/**
 * Unit state in combat (server-authoritative)
 */
export interface CombatUnitState {
  id: string;
  unitTypeId: string;
  ownerId: string; // Player ID
  position: ArenaPosition;
  targetPosition?: ArenaPosition; // If moving
  rotation: number; // Radians
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  state: UnitState;
  targetId?: string; // Current attack target
}

/**
 * Projectile state for visual rendering
 */
export interface ProjectileState {
  id: string;
  sourceId: string; // Unit/tower that fired
  targetId: string; // Target unit/building
  position: WorldPosition;
  type: 'bullet' | 'missile' | 'laser';
  startTime: number;
}

/**
 * Visual effect state
 */
export interface EffectState {
  id: string;
  type: 'explosion' | 'shield_hit' | 'death' | 'spawn';
  position: WorldPosition;
  startTime: number;
  duration: number;
}

/**
 * Combat event for this tick (damage, kills, abilities)
 */
export type CombatEventType = 'damage' | 'kill' | 'ability_used' | 'unit_spawned' | 'hq_damaged';

export interface CombatEvent {
  type: CombatEventType;
  sourceId?: string;
  targetId?: string;
  value?: number; // Damage amount, etc.
  timestamp: number;
}

/**
 * Tower/building state in combat
 */
export interface CombatBuildingState {
  id: string;
  buildingTypeId: string;
  ownerId: string;
  position: ArenaPosition;
  rotation: number;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  targetId?: string;
  isActive: boolean;
}

/**
 * HQ state (primary defender objective)
 */
export interface HQState {
  health: number;
  maxHealth: number;
  damageState: 'healthy' | 'damaged' | 'critical';
}

/**
 * Complete combat state broadcast from server to clients
 */
export interface CombatState {
  battleId: string;
  tick: number;
  timestamp: number;
  phase: CombatPhase;
  timeRemaining: number; // Seconds
  hq: HQState;
  units: CombatUnitState[];
  buildings: CombatBuildingState[];
  projectiles: ProjectileState[];
  effects: EffectState[];
  events: CombatEvent[]; // Events that occurred this tick
}

/**
 * Initial combat setup sent when entering combat
 */
export interface CombatSetup {
  battleId: string;
  attackerId: string;
  defenderId: string;
  nodeId: string;
  nodeType: string;
  arenaLayout: TileType[][]; // 40x40 grid
  attackerUnits: {
    unitTypeId: string;
    count: number;
  }[];
  defenderUnits: {
    unitTypeId: string;
    count: number;
    deployed: boolean; // Garrison units are pre-deployed
  }[];
  defenderBuildings: {
    buildingTypeId: string;
    position: ArenaPosition;
    rotation: number;
  }[];
  hqMaxHealth: number;
  combatDuration: number; // Seconds (1800 = 30 min)
}

/**
 * Combat result after battle ends
 */
export interface CombatResult {
  battleId: string;
  winnerId: string | null; // null = draw/timeout
  reason: 'hq_destroyed' | 'attackers_eliminated' | 'timeout' | 'surrender';
  attackerLosses: Record<string, number>; // unitTypeId -> count
  defenderLosses: Record<string, number>;
  duration: number; // Seconds
  finalHqHealth: number;
}

/**
 * Flow field for pathfinding (pre-computed directions toward HQ)
 */
export interface FlowField {
  width: number;
  height: number;
  directions: number[][]; // Direction in radians per tile, -1 = blocked
}

/**
 * WebSocket event names for combat
 */
export const COMBAT_EVENTS = {
  // Client -> Server
  JOIN_COMBAT: 'combat:join',
  LEAVE_COMBAT: 'combat:leave',
  SEND_INPUT: 'combat:input',
  REQUEST_STATE: 'combat:request_state',

  // Server -> Client
  COMBAT_SETUP: 'combat:setup',
  STATE_UPDATE: 'combat:state',
  COMBAT_END: 'combat:end',
  COMBAT_ERROR: 'combat:error',
} as const;
