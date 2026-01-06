// Game constants and settings

// Starting resources for new players
export const STARTING_RESOURCES = {
  credits: 1000,
  iron: 100,
  energy: 50,
} as const;

// Upkeep settings
export const UPKEEP = {
  BASE_NODE_COST: 50, // Credits per hour
  DISTANCE_PENALTY: 0.15, // +15% per node from HQ
  UPKEEP_CHECK_INTERVAL: 3600000, // 1 hour in ms
} as const;

// Combat timing
export const COMBAT = {
  PREP_TIME_BASE: 24 * 60 * 60 * 1000, // 24 hours in ms
  PREP_TIME_VARIANCE: 4 * 60 * 60 * 1000, // ±4 hours in ms
  FORCES_LOCK_BEFORE: 60 * 60 * 1000, // 1 hour before combat
  COMBAT_DURATION: 30 * 60 * 1000, // 30 minutes
  POST_BATTLE_IMMUNITY: 3 * 60 * 1000, // 3 minutes
  ATTACK_COOLDOWN: 3 * 24 * 60 * 60 * 1000, // 3 days
} as const;

// Free tier limitations
export const FREE_TIER = {
  MAX_TECH_TIER: 2,
  MAX_NODES: 5,
  RESEARCH_QUEUES: 1,
  ACTIVE_TRADE_ROUTES: 3,
  CAN_CREATE_CORPORATION: false,
  MARKET_ACCESS: 'local' as const,
} as const;

// Premium tier benefits
export const PREMIUM_TIER = {
  MAX_TECH_TIER: 5,
  MAX_NODES: 20,
  RESEARCH_QUEUES: 3,
  ACTIVE_TRADE_ROUTES: 10,
  CAN_CREATE_CORPORATION: true,
  MARKET_ACCESS: 'global' as const,
} as const;

// Map settings
export const MAP = {
  TOTAL_NODES: 100,
  AVG_CONNECTIONS_PER_NODE: 3.5,
  MIN_NODE_DISTANCE: 80, // Minimum distance between nodes
  MAX_CONNECTION_DISTANCE: 300, // Maximum connection length
} as const;

// Road type speeds (travel time multiplier)
export const ROAD_SPEEDS = {
  DIRT: 1.0,
  PAVED: 0.75,
  HIGHWAY: 0.5,
  HAZARDOUS: 1.5,
} as const;

// Game tick settings
export const TICK = {
  INTERVAL: 5000, // 5 seconds
  RESOURCE_GENERATION_TICKS: 12, // Every minute (12 * 5s)
  CARAVAN_UPDATE_TICKS: 1, // Every tick
  NPC_AI_TICKS: 6, // Every 30 seconds
} as const;
