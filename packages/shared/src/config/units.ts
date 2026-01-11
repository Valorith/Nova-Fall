/**
 * Unit type definitions for military units
 * Units are trained at Barracks nodes using the crafting system
 */

import { Veterancy } from '../types/enums.js';

/**
 * Base stats for a unit type (before veterancy modifiers)
 */
export interface UnitStats {
  health: number;
  shield: number; // Shield hit points (absorbs damage before health)
  shieldRange: number; // 0 = personal shield (extra HP), >0 = AOE shield radius protecting nearby allies
  damage: number;
  armor: number;
  speed: number; // Movement speed (tiles per minute)
  range: number; // Attack range in tiles
  attackSpeed: number; // Attacks per second
}

/**
 * Training requirements for a unit
 */
export interface UnitTrainingCost {
  credits: number;
  iron?: number;
  energy?: number;
  steelBar?: number;
  grain?: number;
}

/**
 * Unit type definition
 */
export interface UnitTypeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: number; // Required node tier to train
  category: 'infantry' | 'vehicle' | 'mech' | 'support';

  // Base stats (modified by veterancy)
  baseStats: UnitStats;

  // Training
  trainingTime: number; // Seconds to train one unit
  trainingCost: UnitTrainingCost;

  // Upkeep per hour
  upkeep: number;

  // Special abilities (for future expansion)
  abilities?: string[];
}

/**
 * Veterancy stat multipliers
 * Each level improves stats by these percentages
 */
export const VETERANCY_MULTIPLIERS: Record<Veterancy, number> = {
  [Veterancy.ROOKIE]: 1.0,
  [Veterancy.REGULAR]: 1.1,
  [Veterancy.VETERAN]: 1.25,
  [Veterancy.ELITE]: 1.5,
  [Veterancy.LEGENDARY]: 2.0,
};

/**
 * Experience thresholds for veterancy levels
 */
export const VETERANCY_THRESHOLDS: Record<Veterancy, number> = {
  [Veterancy.ROOKIE]: 0,
  [Veterancy.REGULAR]: 100,
  [Veterancy.VETERAN]: 300,
  [Veterancy.ELITE]: 700,
  [Veterancy.LEGENDARY]: 1500,
};

/**
 * Unit type definitions
 * These are the base templates - actual units are created in the database
 */
export const UNIT_TYPES: Record<string, UnitTypeDefinition> = {
  // Basic Infantry - Tier 1 Barracks
  infantry_basic: {
    id: 'infantry_basic',
    name: 'Militia',
    description: 'Basic infantry unit. Cheap and quick to train but fragile.',
    icon: '🪖',
    tier: 1,
    category: 'infantry',
    baseStats: {
      health: 50,
      shield: 0,
      shieldRange: 0,
      damage: 10,
      armor: 5,
      speed: 2,
      range: 1,
      attackSpeed: 1.0,
    },
    trainingTime: 60, // 1 minute
    trainingCost: {
      credits: 50,
      iron: 10,
    },
    upkeep: 2,
  },

  // Standard Infantry - Tier 1 Barracks (requires Steel Bar)
  infantry_standard: {
    id: 'infantry_standard',
    name: 'Marine',
    description: 'Well-equipped infantry with balanced stats.',
    icon: '🎖️',
    tier: 1,
    category: 'infantry',
    baseStats: {
      health: 80,
      shield: 0,
      shieldRange: 0,
      damage: 15,
      armor: 10,
      speed: 2,
      range: 1,
      attackSpeed: 1.2,
    },
    trainingTime: 120, // 2 minutes
    trainingCost: {
      credits: 100,
      steelBar: 2,
      grain: 5,
    },
    upkeep: 5,
  },

  // Heavy Infantry - Tier 2 Barracks
  infantry_heavy: {
    id: 'infantry_heavy',
    name: 'Heavy Trooper',
    description: 'Heavily armored infantry. Slow but tough.',
    icon: '🛡️',
    tier: 2,
    category: 'infantry',
    baseStats: {
      health: 150,
      shield: 25,
      shieldRange: 0,
      damage: 20,
      armor: 25,
      speed: 1,
      range: 1,
      attackSpeed: 0.8,
    },
    trainingTime: 180, // 3 minutes
    trainingCost: {
      credits: 200,
      steelBar: 5,
      energy: 10,
    },
    upkeep: 10,
  },
};

/**
 * Get unit type definition by ID
 */
export function getUnitType(typeId: string): UnitTypeDefinition | undefined {
  return UNIT_TYPES[typeId];
}

/**
 * Calculate effective stats for a unit with veterancy
 */
export function calculateUnitStats(baseStats: UnitStats, veterancy: Veterancy): UnitStats {
  const multiplier = VETERANCY_MULTIPLIERS[veterancy];
  return {
    health: Math.floor(baseStats.health * multiplier),
    shield: Math.floor(baseStats.shield * multiplier),
    shieldRange: baseStats.shieldRange, // Shield range doesn't scale with veterancy
    damage: Math.floor(baseStats.damage * multiplier),
    armor: Math.floor(baseStats.armor * multiplier),
    speed: baseStats.speed, // Speed doesn't scale with veterancy
    range: baseStats.range, // Range doesn't scale with veterancy
    attackSpeed: baseStats.attackSpeed * (1 + (multiplier - 1) * 0.5), // Attack speed scales at half rate
  };
}

/**
 * Get veterancy level from experience
 */
export function getVeterancyFromExperience(experience: number): Veterancy {
  if (experience >= VETERANCY_THRESHOLDS[Veterancy.LEGENDARY]) return Veterancy.LEGENDARY;
  if (experience >= VETERANCY_THRESHOLDS[Veterancy.ELITE]) return Veterancy.ELITE;
  if (experience >= VETERANCY_THRESHOLDS[Veterancy.VETERAN]) return Veterancy.VETERAN;
  if (experience >= VETERANCY_THRESHOLDS[Veterancy.REGULAR]) return Veterancy.REGULAR;
  return Veterancy.ROOKIE;
}

/**
 * Get all unit types trainable at a given node tier
 */
export function getUnitsForTier(tier: number): UnitTypeDefinition[] {
  return Object.values(UNIT_TYPES).filter(unit => unit.tier <= tier);
}
