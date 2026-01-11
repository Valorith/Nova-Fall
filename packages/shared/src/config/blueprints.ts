import { BlueprintCategory, BlueprintQuality } from '../types/enums.js';

// Quality colors (hex values for CSS/UI)
export const BLUEPRINT_QUALITY_COLORS: Record<BlueprintQuality, string> = {
  [BlueprintQuality.COMMON]: '#FFFFFF', // White
  [BlueprintQuality.UNCOMMON]: '#3B82F6', // Blue
  [BlueprintQuality.RARE]: '#EAB308', // Yellow
  [BlueprintQuality.EPIC]: '#A855F7', // Purple
  [BlueprintQuality.LEGENDARY]: '#F97316', // Orange
};

// Quality background colors (muted versions for UI backgrounds)
export const BLUEPRINT_QUALITY_BG_COLORS: Record<BlueprintQuality, string> = {
  [BlueprintQuality.COMMON]: 'rgba(255, 255, 255, 0.1)',
  [BlueprintQuality.UNCOMMON]: 'rgba(59, 130, 246, 0.15)',
  [BlueprintQuality.RARE]: 'rgba(234, 179, 8, 0.15)',
  [BlueprintQuality.EPIC]: 'rgba(168, 85, 247, 0.15)',
  [BlueprintQuality.LEGENDARY]: 'rgba(249, 115, 22, 0.15)',
};

// Quality border colors for UI elements
export const BLUEPRINT_QUALITY_BORDER_COLORS: Record<BlueprintQuality, string> = {
  [BlueprintQuality.COMMON]: 'rgba(255, 255, 255, 0.3)',
  [BlueprintQuality.UNCOMMON]: 'rgba(59, 130, 246, 0.5)',
  [BlueprintQuality.RARE]: 'rgba(234, 179, 8, 0.5)',
  [BlueprintQuality.EPIC]: 'rgba(168, 85, 247, 0.5)',
  [BlueprintQuality.LEGENDARY]: 'rgba(249, 115, 22, 0.5)',
};

// Quality display names (for UI)
export const BLUEPRINT_QUALITY_NAMES: Record<BlueprintQuality, string> = {
  [BlueprintQuality.COMMON]: 'Common',
  [BlueprintQuality.UNCOMMON]: 'Uncommon',
  [BlueprintQuality.RARE]: 'Rare',
  [BlueprintQuality.EPIC]: 'Epic',
  [BlueprintQuality.LEGENDARY]: 'Legendary',
};

// Category display names (for UI)
export const BLUEPRINT_CATEGORY_NAMES: Record<BlueprintCategory, string> = {
  [BlueprintCategory.MECHANICAL]: 'Mechanical',
  [BlueprintCategory.BIOLOGICAL]: 'Biological',
  [BlueprintCategory.REFINEMENT]: 'Refinement',
  [BlueprintCategory.FOOD]: 'Food',
  [BlueprintCategory.ENHANCEMENTS]: 'Enhancements',
  [BlueprintCategory.BUILDINGS]: 'Buildings',
  [BlueprintCategory.EQUIPMENT]: 'Equipment',
  [BlueprintCategory.NODE_CORE]: 'Node Core',
  [BlueprintCategory.UNIT]: 'Unit Training',
};

// Category icons (using common icon identifiers)
export const BLUEPRINT_CATEGORY_ICONS: Record<BlueprintCategory, string> = {
  [BlueprintCategory.MECHANICAL]: 'cog',
  [BlueprintCategory.BIOLOGICAL]: 'leaf',
  [BlueprintCategory.REFINEMENT]: 'fire',
  [BlueprintCategory.FOOD]: 'utensils',
  [BlueprintCategory.ENHANCEMENTS]: 'bolt',
  [BlueprintCategory.BUILDINGS]: 'building',
  [BlueprintCategory.EQUIPMENT]: 'shield',
  [BlueprintCategory.NODE_CORE]: 'cube',
  [BlueprintCategory.UNIT]: 'military',
};

// Quality sort order (for sorting in UI)
export const BLUEPRINT_QUALITY_ORDER: BlueprintQuality[] = [
  BlueprintQuality.COMMON,
  BlueprintQuality.UNCOMMON,
  BlueprintQuality.RARE,
  BlueprintQuality.EPIC,
  BlueprintQuality.LEGENDARY,
];

// Category sort order (for sorting in UI)
export const BLUEPRINT_CATEGORY_ORDER: BlueprintCategory[] = [
  BlueprintCategory.UNIT,
  BlueprintCategory.REFINEMENT,
  BlueprintCategory.MECHANICAL,
  BlueprintCategory.BIOLOGICAL,
  BlueprintCategory.FOOD,
  BlueprintCategory.EQUIPMENT,
  BlueprintCategory.BUILDINGS,
  BlueprintCategory.ENHANCEMENTS,
  BlueprintCategory.NODE_CORE,
];

// Helper function to get quality color
export function getBlueprintQualityColor(quality: BlueprintQuality): string {
  return BLUEPRINT_QUALITY_COLORS[quality] || BLUEPRINT_QUALITY_COLORS[BlueprintQuality.COMMON];
}

// Helper function to get quality name
export function getBlueprintQualityName(quality: BlueprintQuality): string {
  return BLUEPRINT_QUALITY_NAMES[quality] || quality;
}

// Helper function to get category name
export function getBlueprintCategoryName(category: BlueprintCategory): string {
  return BLUEPRINT_CATEGORY_NAMES[category] || category;
}

// Helper to format craft time
export function formatCraftTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${hours}h`;
}
