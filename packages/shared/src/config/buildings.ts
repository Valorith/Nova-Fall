/**
 * Building type definitions for structures
 * Buildings are manufactured at Manufacturing Plant nodes using the crafting system
 * They exist as items in tactical view and are placed in 3D during Combat Mode
 */

/**
 * Base stats for a building type
 * Buildings are stationary and don't have speed, but share other combat stats with units
 */
export interface BuildingStats {
  health: number;
  shield: number; // Shield hit points (absorbs damage before health)
  shieldRange: number; // 0 = personal shield (extra HP), >0 = AOE shield radius protecting nearby allies
  damage: number; // For defense buildings (turrets), 0 for non-combat buildings
  armor: number;
  range: number; // Attack/effect range in tiles
  attackSpeed: number; // Attacks per second (for turrets), 0 for non-combat
}

/**
 * Manufacturing cost for a building
 */
export interface BuildingCraftCost {
  credits: number;
  iron?: number;
  energy?: number;
  steelBar?: number;
  coal?: number;
}

/**
 * Building type definition
 */
export interface BuildingTypeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: number; // Required node tier to manufacture
  category: 'defense' | 'support';

  // Base stats
  baseStats: BuildingStats;

  // Manufacturing
  craftTime: number; // Seconds to manufacture one building
  craftCost: BuildingCraftCost;

  // Size in grid units (for 3D placement in Phase 4)
  size: { width: number; height: number };
}

/**
 * Building type definitions
 * These are the base templates - actual buildings are created as items in the database
 */
export const BUILDING_TYPES: Record<string, BuildingTypeDefinition> = {
  // ==================== DEFENSE ====================

  // Basic Turret - Tier 1
  pulse_turret: {
    id: 'pulse_turret',
    name: 'Pulse Turret',
    description: 'Basic defensive turret. Fires energy bolts at enemies.',
    icon: '🔫',
    tier: 1,
    category: 'defense',
    baseStats: {
      health: 100,
      shield: 0,
      shieldRange: 0,
      damage: 15,
      armor: 10,
      range: 3,
      attackSpeed: 1.0,
    },
    craftTime: 120, // 2 minutes
    craftCost: {
      credits: 200,
      steelBar: 3,
      energy: 20,
    },
    size: { width: 1, height: 1 },
  },

  // Heavy Turret - Tier 2
  heavy_turret: {
    id: 'heavy_turret',
    name: 'Heavy Turret',
    description: 'Heavily armored turret with increased damage output.',
    icon: '🎯',
    tier: 2,
    category: 'defense',
    baseStats: {
      health: 200,
      shield: 25,
      shieldRange: 0,
      damage: 30,
      armor: 20,
      range: 4,
      attackSpeed: 0.8,
    },
    craftTime: 240, // 4 minutes
    craftCost: {
      credits: 500,
      steelBar: 8,
      energy: 50,
    },
    size: { width: 1, height: 1 },
  },

  // Wall Segment - Tier 1
  wall_segment: {
    id: 'wall_segment',
    name: 'Wall Segment',
    description: 'Sturdy defensive wall. Blocks enemy movement and absorbs damage.',
    icon: '🧱',
    tier: 1,
    category: 'defense',
    baseStats: {
      health: 300,
      shield: 0,
      shieldRange: 0,
      damage: 0,
      armor: 40,
      range: 0,
      attackSpeed: 0,
    },
    craftTime: 60, // 1 minute
    craftCost: {
      credits: 50,
      steelBar: 2,
    },
    size: { width: 1, height: 1 },
  },

  // Reinforced Wall - Tier 2
  reinforced_wall: {
    id: 'reinforced_wall',
    name: 'Reinforced Wall',
    description: 'Heavy-duty wall with shield generator. Extremely durable.',
    icon: '🏰',
    tier: 2,
    category: 'defense',
    baseStats: {
      health: 500,
      shield: 100,
      shieldRange: 0,
      damage: 0,
      armor: 60,
      range: 0,
      attackSpeed: 0,
    },
    craftTime: 120, // 2 minutes
    craftCost: {
      credits: 150,
      steelBar: 5,
      energy: 30,
    },
    size: { width: 1, height: 1 },
  },

  // Shield Generator - Tier 1
  shield_generator: {
    id: 'shield_generator',
    name: 'Shield Generator',
    description: 'Projects a protective shield over nearby units and buildings.',
    icon: '🛡️',
    tier: 1,
    category: 'defense',
    baseStats: {
      health: 80,
      shield: 50,
      shieldRange: 4, // AOE shield - protects all allies within 4 tiles
      damage: 0,
      armor: 5,
      range: 0,
      attackSpeed: 0,
    },
    craftTime: 180, // 3 minutes
    craftCost: {
      credits: 300,
      steelBar: 2,
      energy: 50,
    },
    size: { width: 1, height: 1 },
  },

  // ==================== SUPPORT ====================

  // Repair Station - Tier 1
  repair_station: {
    id: 'repair_station',
    name: 'Repair Station',
    description: 'Repairs nearby friendly units and buildings over time.',
    icon: '🔧',
    tier: 1,
    category: 'support',
    baseStats: {
      health: 60,
      shield: 0,
      shieldRange: 0,
      damage: 0, // Negative damage could represent healing in combat logic
      armor: 5,
      range: 3, // Repair range
      attackSpeed: 0,
    },
    craftTime: 150, // 2.5 minutes
    craftCost: {
      credits: 250,
      steelBar: 4,
      energy: 30,
    },
    size: { width: 1, height: 1 },
  },

  // Supply Depot - Tier 1
  supply_depot: {
    id: 'supply_depot',
    name: 'Supply Depot',
    description: 'Provides ammunition and supplies to nearby units, boosting their effectiveness.',
    icon: '📦',
    tier: 1,
    category: 'support',
    baseStats: {
      health: 100,
      shield: 0,
      shieldRange: 0,
      damage: 0,
      armor: 10,
      range: 4, // Buff range
      attackSpeed: 0,
    },
    craftTime: 120, // 2 minutes
    craftCost: {
      credits: 200,
      steelBar: 3,
      iron: 20,
    },
    size: { width: 1, height: 1 },
  },
};

/**
 * Get building type definition by ID
 */
export function getBuildingType(typeId: string): BuildingTypeDefinition | undefined {
  return BUILDING_TYPES[typeId];
}

/**
 * Get all building types trainable at a given node tier
 */
export function getBuildingsForTier(tier: number): BuildingTypeDefinition[] {
  return Object.values(BUILDING_TYPES).filter((building) => building.tier <= tier);
}

/**
 * Get all buildings by category
 */
export function getBuildingsByCategory(category: BuildingTypeDefinition['category']): BuildingTypeDefinition[] {
  return Object.values(BUILDING_TYPES).filter((building) => building.category === category);
}
