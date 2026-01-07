// Resource type identifiers
export type ResourceType =
  | 'credits'
  | 'iron'
  | 'minerals'
  | 'energy'
  | 'composites'
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

// Starting resources for new players (from CLAUDE.md spec)
export const STARTING_RESOURCES: Partial<Record<ResourceType, number>> = {
  credits: 1000,
  iron: 100,
  energy: 50,
};

// Base storage capacity per node type (matches NodeType enum)
export const NODE_BASE_STORAGE: Record<string, number> = {
  CAPITAL: 50000,
  MINING: 30000,
  REFINERY: 25000,
  RESEARCH: 15000,
  TRADE_HUB: 40000,
  FORTRESS: 20000,
  AGRICULTURAL: 25000,
  POWER_PLANT: 20000,
};

// Base upkeep costs per node type (credits per hour, matches NodeType enum)
export const NODE_BASE_UPKEEP: Record<string, number> = {
  CAPITAL: 0, // HQ has no upkeep
  MINING: 40,
  REFINERY: 60,
  RESEARCH: 80,
  TRADE_HUB: 70,
  FORTRESS: 100,
  AGRICULTURAL: 30,
  POWER_PLANT: 50,
};

// Distance upkeep penalty (15% per node from HQ)
export const DISTANCE_UPKEEP_MODIFIER = 0.15;

// Node claim costs by tier (credits)
export const NODE_CLAIM_COST_BY_TIER: Record<number, number> = {
  1: 100,  // Tier 1 nodes
  2: 200,  // Tier 2 nodes
  3: 300,  // Tier 3 nodes
};

// Base production rates per tick (30 seconds, 120 ticks/hour)
// Node type bonuses multiply these values
export const BASE_PRODUCTION_PER_TICK: Partial<Record<ResourceType, number>> = {
  iron: 12,     // 12 iron per tick = 24 per minute = 1440 per hour
  energy: 6,    // 6 energy per tick = 12 per minute = 720 per hour
  minerals: 0,  // Only from special buildings
  composites: 0, // Only from refineries with recipes
  techComponents: 0, // Only from research stations
};

// Credit generation is special - based on trade hub presence
export const BASE_CREDIT_GENERATION = 30; // per tick at trade hubs (3600/hr)

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
  const newStorage = { ...storage };

  if (newAmount === 0) {
    delete newStorage[type];
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
