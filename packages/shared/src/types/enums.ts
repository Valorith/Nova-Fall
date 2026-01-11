// Enums shared between frontend and backend
// These mirror Prisma enums but are usable in the frontend

export enum NodeType {
  MINING = 'MINING',
  REFINERY = 'REFINERY',
  RESEARCH = 'RESEARCH',
  TRADE_HUB = 'TRADE_HUB',
  BARRACKS = 'BARRACKS',
  AGRICULTURAL = 'AGRICULTURAL',
  POWER_PLANT = 'POWER_PLANT',
  MANUFACTURING_PLANT = 'MANUFACTURING_PLANT',
  CAPITAL = 'CAPITAL',
  CROWN = 'CROWN', // Special node for King of the Hill game mode
}

export enum NodeStatus {
  NEUTRAL = 'NEUTRAL',
  CLAIMED = 'CLAIMED',
  CONTESTED = 'CONTESTED',
  UNDER_ATTACK = 'UNDER_ATTACK',
}

export enum RoadType {
  DIRT = 'DIRT',
  PAVED = 'PAVED',
  HIGHWAY = 'HIGHWAY',
  HAZARDOUS = 'HAZARDOUS',
}

export enum StabilityLevel {
  STABLE = 'STABLE',
  UNSTABLE = 'UNSTABLE',
  HAZARDOUS = 'HAZARDOUS',
  EXTREME = 'EXTREME',
}

export enum UnitStatus {
  IDLE = 'IDLE',
  TRAINING = 'TRAINING',
  MOVING = 'MOVING',
  GARRISON = 'GARRISON',
  IN_COMBAT = 'IN_COMBAT',
  ESCORTING = 'ESCORTING',
}

export enum Veterancy {
  ROOKIE = 'ROOKIE',
  REGULAR = 'REGULAR',
  VETERAN = 'VETERAN',
  ELITE = 'ELITE',
  LEGENDARY = 'LEGENDARY',
}

export enum BattleStatus {
  PREP_PHASE = 'PREP_PHASE',
  FORCES_LOCKED = 'FORCES_LOCKED',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CANCELLED = 'CANCELLED',
}

export enum BattleResult {
  ATTACKER_VICTORY = 'ATTACKER_VICTORY',
  DEFENDER_VICTORY = 'DEFENDER_VICTORY',
  DRAW = 'DRAW',
}

export enum CaravanStatus {
  LOADING = 'LOADING',
  EN_ROUTE = 'EN_ROUTE',
  ARRIVED = 'ARRIVED',
  INTERCEPTED = 'INTERCEPTED',
  DESTROYED = 'DESTROYED',
}

// Upkeep status for tracking payment failures
export enum UpkeepStatus {
  PAID = 'PAID',           // Upkeep is current
  WARNING = 'WARNING',     // 0-12h unpaid - warning phase
  DECAY = 'DECAY',         // 12-36h unpaid - structures start decaying
  COLLAPSE = 'COLLAPSE',   // 36-48h unpaid - collapse phase, major damage
  ABANDONED = 'ABANDONED', // 48h+ unpaid - node reverts to neutral
}

// Terrain types for non-node hex cells
export enum TerrainType {
  PLAINS = 'PLAINS', // Basic passable terrain
  FOREST = 'FOREST', // Slows movement, provides cover
  MOUNTAIN = 'MOUNTAIN', // Impassable
  WATER = 'WATER', // Impassable (deep water)
  MARSH = 'MARSH', // Difficult terrain
  DESERT = 'DESERT', // Hot, increases upkeep
  TUNDRA = 'TUNDRA', // Cold, increases upkeep
  WASTELAND = 'WASTELAND', // Irradiated, hazardous
}

// Blueprint quality levels with corresponding colors
export enum BlueprintQuality {
  COMMON = 'COMMON', // White
  UNCOMMON = 'UNCOMMON', // Blue
  RARE = 'RARE', // Yellow
  EPIC = 'EPIC', // Purple
  LEGENDARY = 'LEGENDARY', // Orange
}

// Blueprint categories for filtering and organization
export enum BlueprintCategory {
  MECHANICAL = 'MECHANICAL',
  BIOLOGICAL = 'BIOLOGICAL',
  REFINEMENT = 'REFINEMENT',
  FOOD = 'FOOD',
  ENHANCEMENTS = 'ENHANCEMENTS',
  BUILDINGS = 'BUILDINGS',
  EQUIPMENT = 'EQUIPMENT',
  NODE_CORE = 'NODE_CORE',
  UNIT = 'UNIT', // Military unit training
}

// Item categories for the database item definition system
// Named DbItemCategory to avoid conflict with the legacy ItemCategory type in config/items.ts
export enum DbItemCategory {
  RESOURCE = 'RESOURCE', // Basic materials (iron, energy, etc.)
  NODE_CORE = 'NODE_CORE', // Cores that activate node production
  CONSUMABLE = 'CONSUMABLE', // Single-use items
  EQUIPMENT = 'EQUIPMENT', // Items that can be equipped
  CRAFTED = 'CRAFTED', // Items produced via blueprints
  BLUEPRINT = 'BLUEPRINT', // Blueprint items linked to craftable recipes
  UNIT = 'UNIT', // Military units (trained at Barracks)
  BUILDING = 'BUILDING', // Structures (manufactured at Manufacturing Plant)
}
