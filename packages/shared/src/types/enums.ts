// Enums shared between frontend and backend
// These mirror Prisma enums but are usable in the frontend

export enum NodeType {
  MINING = 'MINING',
  REFINERY = 'REFINERY',
  RESEARCH = 'RESEARCH',
  TRADE_HUB = 'TRADE_HUB',
  FORTRESS = 'FORTRESS',
  AGRICULTURAL = 'AGRICULTURAL',
  POWER_PLANT = 'POWER_PLANT',
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
