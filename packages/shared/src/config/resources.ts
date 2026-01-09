// Resource type identifiers
export type ResourceType =
  | 'credits'
  | 'iron'
  | 'coal'
  | 'grain'
  | 'minerals'
  | 'energy'
  | 'composites'
  | 'steelBar'
  | 'techComponents';

export interface ResourceDefinition {
  id: ResourceType;
  name: string;
  description: string;
  icon: string;
  color: string;
  tier: number; // 1 = basic, 2 = processed, 3 = advanced
  stackSize: number; // Max per storage slot (0 = unlimited for credits)
}

// Resource definitions
export const RESOURCES: Record<ResourceType, ResourceDefinition> = {
  credits: {
    id: 'credits',
    name: 'Credits',
    description: 'Universal currency used for all transactions',
    icon: '💰',
    color: '#FFD700',
    tier: 0,
    stackSize: 0, // Unlimited
  },
  iron: {
    id: 'iron',
    name: 'Iron Ore',
    description: 'Raw iron extracted from planetary deposits',
    icon: '⛏️',
    color: '#8B4513',
    tier: 1,
    stackSize: 10000,
  },
  coal: {
    id: 'coal',
    name: 'Coal',
    description: 'Combustible organic material used in refining processes',
    icon: '🔥',
    color: '#2F2F2F',
    tier: 1,
    stackSize: 10000,
  },
  grain: {
    id: 'grain',
    name: 'Grain',
    description: 'Agricultural produce used for food production and biofuels',
    icon: '🌾',
    color: '#DAA520',
    tier: 1,
    stackSize: 10000,
  },
  minerals: {
    id: 'minerals',
    name: 'Rare Minerals',
    description: 'Valuable minerals used in advanced manufacturing',
    icon: '💎',
    color: '#9370DB',
    tier: 1,
    stackSize: 5000,
  },
  energy: {
    id: 'energy',
    name: 'Energy Cells',
    description: 'Portable power storage for operations and buildings',
    icon: '⚡',
    color: '#00BFFF',
    tier: 1,
    stackSize: 10000,
  },
  composites: {
    id: 'composites',
    name: 'Composites',
    description: 'Processed materials for construction and manufacturing',
    icon: '🔩',
    color: '#708090',
    tier: 2,
    stackSize: 5000,
  },
  steelBar: {
    id: 'steelBar',
    name: 'Steel Bar',
    description: 'Refined metal alloy used in construction and manufacturing',
    icon: '🔗',
    color: '#71797E',
    tier: 2,
    stackSize: 5000,
  },
  techComponents: {
    id: 'techComponents',
    name: 'Tech Components',
    description: 'High-tech parts for advanced buildings and units',
    icon: '⚙️',
    color: '#32CD32',
    tier: 3,
    stackSize: 1000,
  },
};

// Resource type array for iteration
export const RESOURCE_TYPES: ResourceType[] = Object.keys(RESOURCES) as ResourceType[];

// Starting credits (global resource stored in GameSessionPlayer)
export const STARTING_CREDITS = 1000;

// Starting node resources (stored in HQ node storage at game start)
export const STARTING_NODE_RESOURCES: Partial<Record<ResourceType, number>> = {
  iron: 100,
  energy: 50,
};

// Combined starting resources for display/reference (from CLAUDE.md spec)
export const STARTING_RESOURCES: Partial<Record<ResourceType, number>> = {
  credits: STARTING_CREDITS,
  ...STARTING_NODE_RESOURCES,
};

// Base storage capacity per node type (matches NodeType enum)
export const NODE_BASE_STORAGE: Record<string, number> = {
  CAPITAL: 50000,
  MINING: 30000,
  REFINERY: 25000,
  RESEARCH: 15000,
  TRADE_HUB: 40000,
  BARRACKS: 20000,
  AGRICULTURAL: 25000,
  POWER_PLANT: 20000,
  MANUFACTURING_PLANT: 30000,
};

// Base upkeep costs per node type (credits per hour, matches NodeType enum)
export const NODE_BASE_UPKEEP: Record<string, number> = {
  CAPITAL: 0, // HQ has no upkeep
  MINING: 40,
  REFINERY: 60,
  RESEARCH: 80,
  TRADE_HUB: 70,
  BARRACKS: 100,
  AGRICULTURAL: 30,
  POWER_PLANT: 50,
  MANUFACTURING_PLANT: 65,
};

// Distance upkeep penalty (15% per node from HQ)
export const DISTANCE_UPKEEP_MODIFIER = 0.15;

// Node claim costs by tier (credits)
export const NODE_CLAIM_COST_BY_TIER: Record<number, number> = {
  1: 100,  // Tier 1 nodes
  2: 200,  // Tier 2 nodes
  3: 300,  // Tier 3 nodes
};

// Hourly production rates by node type (resources generated per hour per active node)
// Note: Nodes require installed cores to produce (except CAPITAL and CROWN which are always active)
export const HOURLY_PRODUCTION: Record<string, Partial<Record<ResourceType, number>>> = {
  MINING: { iron: 50 },
  POWER_PLANT: { energy: 80 },
  REFINERY: {},  // Crafting/refining only, no passive production
  RESEARCH: { minerals: 15 },
  AGRICULTURAL: { coal: 25, grain: 50 },
  TRADE_HUB: {},  // Enables market access, no passive production
  CAPITAL: { credits: 20, iron: 25, energy: 25 },
  BARRACKS: {},  // Unit production only, no passive resources
  MANUFACTURING_PLANT: {},  // Crafting only, no passive production
  CROWN: {},  // Victory objective, no production
};

// Get production rates for a node type (with optional tier multiplier)
export function getNodeProduction(
  nodeType: string,
  tier: number = 1
): Partial<Record<ResourceType, number>> {
  const base = HOURLY_PRODUCTION[nodeType] ?? {};
  const tierMultiplier = 1 + (tier - 1) * 0.25; // 25% bonus per tier

  const result: Partial<Record<ResourceType, number>> = {};
  for (const [resource, amount] of Object.entries(base)) {
    if (amount) {
      result[resource as ResourceType] = Math.floor(amount * tierMultiplier);
    }
  }
  return result;
}

// Check if a node type has any passive production
export function nodeHasProduction(nodeType: string): boolean {
  const production = HOURLY_PRODUCTION[nodeType];
  return !!production && Object.keys(production).length > 0;
}

// Helper type for resource storage
export type ResourceStorage = Partial<Record<ResourceType, number>>;

// Helper functions
export function createEmptyStorage(): ResourceStorage {
  return {};
}

export function getResourceAmount(storage: ResourceStorage, type: ResourceType): number {
  return storage[type] ?? 0;
}

export function addResources(
  storage: ResourceStorage,
  type: ResourceType,
  amount: number,
  maxCapacity?: number
): { storage: ResourceStorage; added: number; overflow: number } {
  const current = getResourceAmount(storage, type);
  let toAdd = amount;
  let overflow = 0;

  if (maxCapacity !== undefined && maxCapacity > 0) {
    const availableSpace = maxCapacity - current;
    if (toAdd > availableSpace) {
      overflow = toAdd - availableSpace;
      toAdd = availableSpace;
    }
  }

  return {
    storage: { ...storage, [type]: current + toAdd },
    added: toAdd,
    overflow,
  };
}

export function subtractResources(
  storage: ResourceStorage,
  type: ResourceType,
  amount: number
): { storage: ResourceStorage; subtracted: number; shortage: number } {
  const current = getResourceAmount(storage, type);
  let toSubtract = amount;
  let shortage = 0;

  if (toSubtract > current) {
    shortage = toSubtract - current;
    toSubtract = current;
  }

  const newAmount = current - toSubtract;
  let newStorage = { ...storage };

  if (newAmount === 0) {
    // Remove the key by creating object without it
    const { [type]: _, ...rest } = newStorage;
    newStorage = rest;
  } else {
    newStorage[type] = newAmount;
  }

  return {
    storage: newStorage,
    subtracted: toSubtract,
    shortage,
  };
}

export function hasResources(
  storage: ResourceStorage,
  type: ResourceType,
  amount: number
): boolean {
  return getResourceAmount(storage, type) >= amount;
}

export function canAfford(
  storage: ResourceStorage,
  cost: ResourceStorage
): boolean {
  for (const [type, amount] of Object.entries(cost)) {
    if (!hasResources(storage, type as ResourceType, amount ?? 0)) {
      return false;
    }
  }
  return true;
}

export function deductCost(
  storage: ResourceStorage,
  cost: ResourceStorage
): ResourceStorage | null {
  if (!canAfford(storage, cost)) {
    return null;
  }

  let result = { ...storage };
  for (const [type, amount] of Object.entries(cost)) {
    const { storage: newStorage } = subtractResources(result, type as ResourceType, amount ?? 0);
    result = newStorage;
  }
  return result;
}

export function getTotalStorageUsed(storage: ResourceStorage): number {
  return Object.values(storage).reduce((sum, amount) => sum + (amount ?? 0), 0);
}

// Market configuration

// Transaction fee (15%)
export const MARKET_TRANSACTION_FEE = 0.15;

// NPC Market fixed prices (credits per unit)
// Buy prices are what the NPC will sell to players
// Sell prices are what the NPC will buy from players
export interface MarketPrice {
  buyPrice: number;  // Price player pays to buy from NPC
  sellPrice: number; // Price player receives when selling to NPC
}

export const NPC_MARKET_PRICES: Record<Exclude<ResourceType, 'credits'>, MarketPrice> = {
  iron: {
    buyPrice: 10,   // Player pays 10 credits to buy 1 iron ore
    sellPrice: 7,   // Player gets 7 credits for selling 1 iron ore (30% spread)
  },
  coal: {
    buyPrice: 8,    // Coal is cheap
    sellPrice: 5,
  },
  grain: {
    buyPrice: 6,    // Grain is basic agricultural produce
    sellPrice: 4,
  },
  minerals: {
    buyPrice: 50,   // Rare minerals are expensive
    sellPrice: 35,
  },
  energy: {
    buyPrice: 15,
    sellPrice: 10,
  },
  composites: {
    buyPrice: 80,   // Processed materials
    sellPrice: 56,
  },
  steelBar: {
    buyPrice: 30,   // Refined material - valuable
    sellPrice: 21,
  },
  techComponents: {
    buyPrice: 200,  // High-tech components are very expensive
    sellPrice: 140,
  },
};

// Get tradeable resource types (everything except credits)
export const TRADEABLE_RESOURCES: Exclude<ResourceType, 'credits'>[] = [
  'iron',
  'coal',
  'grain',
  'minerals',
  'energy',
  'composites',
  'steelBar',
  'techComponents',
];

// Calculate cost to buy resources from NPC
export function calculateBuyCost(
  resourceType: Exclude<ResourceType, 'credits'>,
  quantity: number
): { cost: number; fee: number; total: number } {
  const price = NPC_MARKET_PRICES[resourceType];
  const baseCost = price.buyPrice * quantity;
  const fee = Math.ceil(baseCost * MARKET_TRANSACTION_FEE);
  return {
    cost: baseCost,
    fee,
    total: baseCost + fee,
  };
}

// Calculate credits received from selling to NPC
export function calculateSellRevenue(
  resourceType: Exclude<ResourceType, 'credits'>,
  quantity: number
): { revenue: number; fee: number; net: number } {
  const price = NPC_MARKET_PRICES[resourceType];
  const baseRevenue = price.sellPrice * quantity;
  const fee = Math.ceil(baseRevenue * MARKET_TRANSACTION_FEE);
  return {
    revenue: baseRevenue,
    fee,
    net: baseRevenue - fee,
  };
}
