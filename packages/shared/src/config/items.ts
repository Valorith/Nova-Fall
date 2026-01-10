// Unified item system for flexible node storage
// Supports resources, node cores, crafted items, and future item types

import { RESOURCES, type ResourceType } from './resources.js';
import { NODE_CORES, type NodeCoreId } from './nodeCores.js';

// Item categories
export type ItemCategory = 'resource' | 'core' | 'equipment' | 'consumable';

// Generic item definition
export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: ItemCategory;
  stackSize: number; // 0 = unlimited
}

// ItemType includes resources and node cores
export type ItemType = ResourceType | NodeCoreId;

// Flexible storage type - can hold any item type
export type ItemStorage = Partial<Record<string, number>>;

// Get item definition by ID
// Returns undefined for unknown items (forward compatibility)
export function getItemDefinition(itemId: string): ItemDefinition | undefined {
  // Check if it's a resource
  if (itemId in RESOURCES) {
    const resource = RESOURCES[itemId as ResourceType];
    return {
      id: resource.id,
      name: resource.name,
      description: resource.description,
      icon: resource.icon,
      color: resource.color,
      category: 'resource',
      stackSize: resource.stackSize,
    };
  }

  // Check if it's a node core
  if (itemId in NODE_CORES) {
    const core = NODE_CORES[itemId as NodeCoreId];
    return {
      id: core.id,
      name: core.name,
      description: core.description,
      icon: core.icon,
      color: core.color,
      category: 'core',
      stackSize: 100, // Cores stack up to 100
    };
  }

  return undefined;
}

// Get display name for any item (falls back to ID if unknown)
export function getItemName(itemId: string): string {
  const def = getItemDefinition(itemId);
  return def?.name ?? itemId;
}

// Get icon for any item (falls back to generic icon if unknown)
export function getItemIcon(itemId: string): string {
  const def = getItemDefinition(itemId);
  return def?.icon ?? '📦';
}

// Get color for any item (falls back to gray if unknown)
export function getItemColor(itemId: string): string {
  const def = getItemDefinition(itemId);
  return def?.color ?? '#888888';
}

// Get category for any item
export function getItemCategory(itemId: string): ItemCategory | 'unknown' {
  const def = getItemDefinition(itemId);
  return def?.category ?? 'unknown';
}

// Check if an item ID is a known resource
export function isResource(itemId: string): itemId is ResourceType {
  return itemId in RESOURCES;
}

// Check if an item ID is a node core
export function isNodeCore(itemId: string): itemId is NodeCoreId {
  return itemId in NODE_CORES;
}

// Get all items in storage as array with definitions
export function getStorageItems(storage: ItemStorage): Array<{
  itemId: string;
  amount: number;
  definition: ItemDefinition | undefined;
}> {
  return Object.entries(storage)
    .filter(([, amount]) => amount !== undefined && amount > 0)
    .map(([itemId, amount]) => ({
      itemId,
      amount: amount!,
      definition: getItemDefinition(itemId),
    }))
    .sort((a, b) => {
      // Sort by category (resources first), then by name
      const catA = a.definition?.category ?? 'zzz';
      const catB = b.definition?.category ?? 'zzz';
      if (catA !== catB) return catA.localeCompare(catB);
      return (a.definition?.name ?? a.itemId).localeCompare(b.definition?.name ?? b.itemId);
    });
}

// Calculate total storage used (counts all items)
export function getTotalItemCount(storage: ItemStorage): number {
  return Object.values(storage).reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
}

// Add items to storage (respects capacity if provided)
export function addItems(
  storage: ItemStorage,
  itemId: string,
  amount: number,
  maxCapacity?: number
): { storage: ItemStorage; added: number; overflow: number } {
  const current = storage[itemId] ?? 0;
  let toAdd = amount;
  let overflow = 0;

  if (maxCapacity !== undefined && maxCapacity > 0) {
    const totalUsed = getTotalItemCount(storage);
    const availableSpace = maxCapacity - totalUsed;
    if (toAdd > availableSpace) {
      overflow = toAdd - availableSpace;
      toAdd = Math.max(0, availableSpace);
    }
  }

  return {
    storage: { ...storage, [itemId]: current + toAdd },
    added: toAdd,
    overflow,
  };
}

// Remove items from storage
export function removeItems(
  storage: ItemStorage,
  itemId: string,
  amount: number
): { storage: ItemStorage; removed: number; shortage: number } {
  const current = storage[itemId] ?? 0;
  let toRemove = amount;
  let shortage = 0;

  if (toRemove > current) {
    shortage = toRemove - current;
    toRemove = current;
  }

  const newAmount = current - toRemove;
  const newStorage = { ...storage };

  if (newAmount === 0) {
    delete newStorage[itemId];
  } else {
    newStorage[itemId] = newAmount;
  }

  return {
    storage: newStorage,
    removed: toRemove,
    shortage,
  };
}

// Check if storage has at least the specified amount of an item
export function hasItems(storage: ItemStorage, itemId: string, amount: number): boolean {
  return (storage[itemId] ?? 0) >= amount;
}

// Check if storage can afford a cost (multiple items)
export function canAffordItems(storage: ItemStorage, cost: ItemStorage): boolean {
  for (const [itemId, amount] of Object.entries(cost)) {
    if (!hasItems(storage, itemId, amount ?? 0)) {
      return false;
    }
  }
  return true;
}

// Deduct multiple items from storage (returns null if can't afford)
export function deductItems(storage: ItemStorage, cost: ItemStorage): ItemStorage | null {
  if (!canAffordItems(storage, cost)) {
    return null;
  }

  let result = { ...storage };
  for (const [itemId, amount] of Object.entries(cost)) {
    const { storage: newStorage } = removeItems(result, itemId, amount ?? 0);
    result = newStorage;
  }
  return result;
}

// ==================== CORE EFFICIENCY ====================

// Valid efficiency values (1-5)
export const MIN_EFFICIENCY = 1;
export const MAX_EFFICIENCY = 5;

// Bonus per efficiency point above 1 (10%)
export const EFFICIENCY_BONUS_PER_POINT = 0.1;

/**
 * Calculate the efficiency multiplier for production and crafting speed.
 * Each point above 1 adds 10% bonus.
 * @param efficiency - Core efficiency (1-5)
 * @returns Multiplier (1.0 at efficiency 1, up to 1.4 at efficiency 5)
 */
export function getEfficiencyMultiplier(efficiency: number): number {
  const clamped = Math.max(MIN_EFFICIENCY, Math.min(MAX_EFFICIENCY, efficiency));
  const bonusPoints = clamped - 1;
  return 1 + bonusPoints * EFFICIENCY_BONUS_PER_POINT;
}

/**
 * Calculate the fee reduction for Trade Hub cores.
 * Each point above 1 reduces fees by 10%.
 * @param efficiency - Core efficiency (1-5)
 * @returns Fee multiplier (1.0 at efficiency 1, down to 0.6 at efficiency 5)
 */
export function getTradeFeeMultiplier(efficiency: number): number {
  const clamped = Math.max(MIN_EFFICIENCY, Math.min(MAX_EFFICIENCY, efficiency));
  const bonusPoints = clamped - 1;
  return Math.max(0, 1 - bonusPoints * EFFICIENCY_BONUS_PER_POINT);
}

/**
 * Apply efficiency bonus to a base production amount.
 * @param baseAmount - Base hourly production
 * @param efficiency - Core efficiency (1-5)
 * @returns Boosted production amount (floored to integer)
 */
export function applyEfficiencyToProduction(baseAmount: number, efficiency: number): number {
  return Math.floor(baseAmount * getEfficiencyMultiplier(efficiency));
}

/**
 * Apply efficiency bonus to reduce crafting time.
 * @param baseTimeMs - Base crafting time in milliseconds
 * @param efficiency - Core efficiency (1-5)
 * @returns Reduced crafting time (floored to integer)
 */
export function applyEfficiencyToCraftingTime(baseTimeMs: number, efficiency: number): number {
  // Higher efficiency = faster crafting = divide by multiplier
  return Math.floor(baseTimeMs / getEfficiencyMultiplier(efficiency));
}

/**
 * Apply efficiency to reduce trading fee.
 * @param baseFeePercent - Base transaction fee (e.g., 0.15 for 15%)
 * @param efficiency - Core efficiency (1-5)
 * @returns Reduced fee percentage
 */
export function applyEfficiencyToTradeFee(baseFeePercent: number, efficiency: number): number {
  return baseFeePercent * getTradeFeeMultiplier(efficiency);
}
