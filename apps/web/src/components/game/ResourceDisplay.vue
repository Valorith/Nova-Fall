<script setup lang="ts">
import { computed } from 'vue';
import { getStorageItems, getTotalItemCount, type ItemStorage } from '@nova-fall/shared';
import Tooltip from '@/components/ui/Tooltip.vue';

const props = defineProps<{
  resources: ItemStorage;
  showZero?: boolean;
  compact?: boolean;
  maxCapacity?: number;
}>();

// Get items to display using the flexible item system
const displayItems = computed(() => {
  const items = getStorageItems(props.resources);

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
  return getTotalItemCount(props.resources);
});

const storagePercent = computed(() => {
  if (!props.maxCapacity) return 0;
  return Math.min(100, (totalUsed.value / props.maxCapacity) * 100);
});
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
        :text="item.definition?.description ?? 'Unknown item'"
        position="left"
      >
        <div
          :class="[
            'resource-item flex items-center gap-1.5 rounded px-2 py-1',
            compact ? 'bg-gray-800/50' : 'bg-gray-800/30'
          ]"
        >
          <span class="text-base">{{ item.definition?.icon ?? '📦' }}</span>
          <span :class="compact ? 'text-xs' : 'text-sm'" class="text-gray-300">
            {{ formatAmount(item.amount) }}
          </span>
          <span v-if="!compact" class="text-xs text-gray-500 truncate">
            {{ item.definition?.name ?? item.itemId }}
          </span>
        </div>
      </Tooltip>
    </div>
  </div>
</template>

<style scoped>
.resource-item {
  cursor: default;
}
</style>
