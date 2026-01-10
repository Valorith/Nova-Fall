import { DbItemCategory } from '../types/enums.js';

// Category display names
export const ITEM_CATEGORY_NAMES: Record<DbItemCategory, string> = {
  [DbItemCategory.RESOURCE]: 'Resource',
  [DbItemCategory.NODE_CORE]: 'Node Core',
  [DbItemCategory.CONSUMABLE]: 'Consumable',
  [DbItemCategory.EQUIPMENT]: 'Equipment',
  [DbItemCategory.CRAFTED]: 'Crafted',
  [DbItemCategory.BLUEPRINT]: 'Blueprint',
};

// Category icons
export const ITEM_CATEGORY_ICONS: Record<DbItemCategory, string> = {
  [DbItemCategory.RESOURCE]: '📦',
  [DbItemCategory.NODE_CORE]: '⚙️',
  [DbItemCategory.CONSUMABLE]: '🧪',
  [DbItemCategory.EQUIPMENT]: '🛡️',
  [DbItemCategory.CRAFTED]: '🔨',
  [DbItemCategory.BLUEPRINT]: '📜',
};

// Category colors
export const ITEM_CATEGORY_COLORS: Record<DbItemCategory, string> = {
  [DbItemCategory.RESOURCE]: '#60a5fa', // Blue
  [DbItemCategory.NODE_CORE]: '#f97316', // Orange
  [DbItemCategory.CONSUMABLE]: '#a855f7', // Purple
  [DbItemCategory.EQUIPMENT]: '#22c55e', // Green
  [DbItemCategory.CRAFTED]: '#eab308', // Yellow
  [DbItemCategory.BLUEPRINT]: '#ec4899', // Pink
};

// Tier names
export const ITEM_TIER_NAMES: Record<number, string> = {
  0: 'Currency',
  1: 'Basic',
  2: 'Processed',
  3: 'Advanced',
  4: 'Elite',
  5: 'Legendary',
};

// Tier colors
export const ITEM_TIER_COLORS: Record<number, string> = {
  0: '#ffd700', // Gold for currency
  1: '#9ca3af', // Gray
  2: '#60a5fa', // Blue
  3: '#a855f7', // Purple
  4: '#f97316', // Orange
  5: '#fbbf24', // Yellow/gold
};

// Helper to get category name
export function getItemCategoryName(category: DbItemCategory): string {
  return ITEM_CATEGORY_NAMES[category] || category;
}

// Helper to get category icon
export function getItemCategoryIcon(category: DbItemCategory): string {
  return ITEM_CATEGORY_ICONS[category] || '📦';
}

// Helper to get category color
export function getItemCategoryColor(category: DbItemCategory): string {
  return ITEM_CATEGORY_COLORS[category] || '#888888';
}

// Helper to get tier name
export function getItemTierName(tier: number): string {
  return ITEM_TIER_NAMES[tier] || `Tier ${tier}`;
}

// Helper to get tier color
export function getItemTierColor(tier: number): string {
  return ITEM_TIER_COLORS[tier] || '#888888';
}
