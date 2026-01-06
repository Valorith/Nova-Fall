<script setup lang="ts">
import { computed } from 'vue';
import { RESOURCES, type ResourceType, type ResourceStorage } from '@nova-fall/shared';
import Tooltip from '@/components/ui/Tooltip.vue';

const props = defineProps<{
  resources: ResourceStorage;
  showZero?: boolean;
  compact?: boolean;
  maxCapacity?: number;
}>();

// Get resources to display (filter out zeros unless showZero is true)
const displayResources = computed(() => {
  const entries: { type: ResourceType; amount: number; def: typeof RESOURCES.credits }[] = [];

  for (const [type, amount] of Object.entries(props.resources)) {
    if (amount === undefined || amount === null) continue;
    if (!props.showZero && amount === 0) continue;

    const def = RESOURCES[type as ResourceType];
    if (def) {
      entries.push({ type: type as ResourceType, amount, def });
    }
  }

  // Sort by tier, then by name
  return entries.sort((a, b) => {
    if (a.def.tier !== b.def.tier) return a.def.tier - b.def.tier;
    return a.def.name.localeCompare(b.def.name);
  });
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
  return Object.values(props.resources).reduce((sum, val) => sum + (val ?? 0), 0);
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

    <!-- No resources message -->
    <div
      v-if="displayResources.length === 0"
      class="text-center text-gray-500 text-sm py-2"
    >
      No resources stored
    </div>

    <!-- Resource list -->
    <div
      v-else
      :class="compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-2 gap-2'"
    >
      <Tooltip
        v-for="{ type, amount, def } in displayResources"
        :key="type"
        :text="def.description"
        position="left"
      >
        <div
          :class="[
            'resource-item flex items-center gap-1.5 rounded px-2 py-1',
            compact ? 'bg-gray-800/50' : 'bg-gray-800/30'
          ]"
        >
          <span class="text-base">{{ def.icon }}</span>
          <span :class="compact ? 'text-xs' : 'text-sm'" class="text-gray-300">
            {{ formatAmount(amount) }}
          </span>
          <span v-if="!compact" class="text-xs text-gray-500 truncate">
            {{ def.name }}
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
