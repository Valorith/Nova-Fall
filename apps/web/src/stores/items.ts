import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { itemsApi, type ItemDefinition } from '@/services/api';

export interface ItemDisplayInfo {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string;
  category: string;
  stackSize: number;
  quality: string;
}

export const useItemsStore = defineStore('items', () => {
  // State
  const items = ref<Map<string, ItemDefinition>>(new Map());
  const isLoaded = ref(false);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Computed
  const itemCount = computed(() => items.value.size);

  // Load all item definitions from API
  async function loadItems() {
    if (isLoading.value) return;

    isLoading.value = true;
    error.value = null;

    try {
      const response = await itemsApi.getAll({ limit: 1000 });
      const itemMap = new Map<string, ItemDefinition>();

      for (const item of response.data.items) {
        itemMap.set(item.itemId, item);
      }

      items.value = itemMap;
      isLoaded.value = true;
    } catch (err) {
      console.error('Failed to load item definitions:', err);
      error.value = err instanceof Error ? err.message : 'Failed to load items';
    } finally {
      isLoading.value = false;
    }
  }

  // Get item definition by ID
  function getItem(itemId: string): ItemDefinition | undefined {
    return items.value.get(itemId);
  }

  // Get display info for an item (with fallbacks for unknown items)
  function getItemDisplay(itemId: string): ItemDisplayInfo {
    const item = items.value.get(itemId);

    if (item) {
      return {
        id: item.itemId,
        name: item.name,
        description: item.description,
        icon: item.icon,
        color: item.color,
        category: item.category,
        stackSize: item.stackSize,
        quality: item.quality,
      };
    }

    // Fallback for unknown items
    return {
      id: itemId,
      name: itemId,
      description: null,
      icon: null,
      color: '#888888',
      category: 'unknown',
      stackSize: 9999,
      quality: 'COMMON',
    };
  }

  // Get item name (with fallback)
  function getItemName(itemId: string): string {
    return items.value.get(itemId)?.name ?? itemId;
  }

  // Get item icon (with fallback)
  function getItemIcon(itemId: string): string | null {
    return items.value.get(itemId)?.icon ?? null;
  }

  // Get item color (with fallback)
  function getItemColor(itemId: string): string {
    return items.value.get(itemId)?.color ?? '#888888';
  }

  // Check if icon is a URL/path (uploaded image) vs emoji
  function isIconUrl(icon: string | null): boolean {
    if (!icon) return false;
    return icon.startsWith('/') || icon.startsWith('http');
  }

  // Get all items in storage as array with display info
  function getStorageItems(storage: Record<string, number | undefined>): Array<{
    itemId: string;
    amount: number;
    display: ItemDisplayInfo;
    isBlueprint: boolean;
    linkedBlueprintId: string | null;
  }> {
    return Object.entries(storage)
      .filter(([, amount]) => amount !== undefined && amount > 0)
      .map(([itemId, amount]) => {
        const item = items.value.get(itemId);
        // Consider an item a learnable blueprint if:
        // 1. isBlueprint flag is true, OR
        // 2. category is BLUEPRINT and has a linkedBlueprintId
        const isBlueprintItem = Boolean(item?.isBlueprint) ||
          (item?.category === 'BLUEPRINT' && Boolean(item?.linkedBlueprintId));
        return {
          itemId,
          amount: amount!,
          display: getItemDisplay(itemId),
          isBlueprint: isBlueprintItem,
          linkedBlueprintId: item?.linkedBlueprintId ?? null,
        };
      })
      .sort((a, b) => {
        // Sort by category (resources first), then by name
        const catA = a.display.category;
        const catB = b.display.category;
        if (catA !== catB) {
          // Resources come first
          if (catA === 'RESOURCE') return -1;
          if (catB === 'RESOURCE') return 1;
          return catA.localeCompare(catB);
        }
        return a.display.name.localeCompare(b.display.name);
      });
  }

  // Get items by category
  function getItemsByCategory(category: string): ItemDefinition[] {
    return Array.from(items.value.values()).filter(item => item.category === category);
  }

  // Get all items as array
  function getAllItems(): ItemDefinition[] {
    return Array.from(items.value.values());
  }

  return {
    // State
    items,
    isLoaded,
    isLoading,
    error,

    // Computed
    itemCount,

    // Actions
    loadItems,
    getItem,
    getItemDisplay,
    getItemName,
    getItemIcon,
    getItemColor,
    isIconUrl,
    getStorageItems,
    getItemsByCategory,
    getAllItems,
  };
});
