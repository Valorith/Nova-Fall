<script setup lang="ts">
import { computed } from 'vue';
import type { ItemStorage } from '@nova-fall/shared';
import { useItemsStore } from '@/stores/items';
import Tooltip from '@/components/ui/Tooltip.vue';

const props = defineProps<{
  resources: ItemStorage;
  showZero?: boolean;
  compact?: boolean;
  maxCapacity?: number;
}>();

const emit = defineEmits<{
  'blueprint-clicked': [itemId: string];
}>();

const itemsStore = useItemsStore();

// Handle item click - emit event if it's a blueprint
function handleItemClick(item: { itemId: string; isBlueprint: boolean }) {
  if (item.isBlueprint) {
    emit('blueprint-clicked', item.itemId);
  }
}

// Get items to display using the database-backed item system
const displayItems = computed(() => {
  const items = itemsStore.getStorageItems(props.resources);

  // Filter out zeros unless showZero is true
  if (!props.showZero) {
    return items.filter(item => item.amount > 0);
  }

  return items;
});

// Format large numbers
function formatAmount(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(1)}K`;
  }
  return amount.toLocaleString();
}

// Calculate total storage used
const totalUsed = computed(() => {
  return Object.values(props.resources).reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
});

const storagePercent = computed(() => {
  if (!props.maxCapacity) return 0;
  return Math.min(100, (totalUsed.value / props.maxCapacity) * 100);
});

// Get text color class based on item quality
function getQualityColorClass(quality: string): string {
  switch (quality) {
    case 'LEGENDARY':
      return 'text-orange-400';
    case 'EPIC':
      return 'text-purple-400';
    case 'RARE':
      return 'text-yellow-400';
    case 'UNCOMMON':
      return 'text-blue-400';
    case 'COMMON':
    default:
      return 'text-gray-400';
  }
}
</script>

<template>
  <div :class="compact ? 'space-y-1' : 'space-y-2'">
    <!-- Storage capacity bar (if maxCapacity provided) -->
    <div v-if="maxCapacity && maxCapacity > 0" class="mb-2">
      <div class="flex justify-between text-xs text-gray-400 mb-1">
        <span>Storage</span>
        <span>{{ formatAmount(totalUsed) }} / {{ formatAmount(maxCapacity) }}</span>
      </div>
      <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          class="h-full transition-all duration-300 min-w-[2px]"
          :class="storagePercent > 90 ? 'bg-red-500' : storagePercent > 70 ? 'bg-yellow-500' : 'bg-blue-500'"
          :style="{ width: `${Math.max(storagePercent, 0)}%` }"
        />
      </div>
    </div>

    <!-- No items message -->
    <div
      v-if="displayItems.length === 0"
      class="text-center text-gray-500 text-sm py-2"
    >
      No items stored
    </div>

    <!-- Item list (supports resources, cores, and any future items) -->
    <div
      v-else
      :class="compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-2 gap-2'"
    >
      <Tooltip
        v-for="item in displayItems"
        :key="item.itemId"
        :text="item.display.description ?? 'Unknown item'"
        position="left"
      >
        <div
          :class="[
            'resource-item flex items-center gap-1.5 rounded px-2 py-1',
            compact ? 'bg-gray-800/50' : 'bg-gray-800/30',
            item.isBlueprint ? 'cursor-pointer hover:bg-gray-700/50 transition-colors border border-blue-500/50 hover:border-blue-400' : ''
          ]"
          @click="handleItemClick(item)"
        >
          <!-- Icon: image or emoji -->
          <template v-if="itemsStore.isIconUrl(item.display.icon)">
            <img :src="item.display.icon!" :alt="item.display.name" class="w-5 h-5 object-contain" />
          </template>
          <span v-else class="text-base">{{ item.display.icon ?? '📦' }}</span>
          <span :class="compact ? 'text-xs' : 'text-sm'" class="text-gray-300">
            {{ formatAmount(item.amount) }}
          </span>
          <span v-if="!compact" class="text-xs truncate" :class="getQualityColorClass(item.display.quality)">
            {{ item.display.name }}
          </span>
          <!-- Blueprint indicator -->
          <span v-if="item.isBlueprint && !compact" class="ml-auto text-xs text-blue-400">
            📖
          </span>
        </div>
      </Tooltip>
    </div>
  </div>
</template>

<style scoped>
.resource-item:not(.cursor-pointer) {
  cursor: default;
}
</style>
