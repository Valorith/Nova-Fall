<script setup lang="ts">
import { computed } from 'vue';
import { RESOURCES, type ResourceStorage } from '@nova-fall/shared';

const props = defineProps<{
  resources: ResourceStorage;
}>();

// Format large numbers compactly
function formatAmount(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(1)}K`;
  }
  return amount.toLocaleString();
}

// Get primary resources to always display (credits, iron, energy)
const primaryResources = computed(() => {
  const primary = ['credits', 'iron', 'energy'] as const;
  return primary.map(type => ({
    type,
    amount: props.resources[type] ?? 0,
    def: RESOURCES[type],
  }));
});

// Get secondary resources (only if player has them)
const secondaryResources = computed(() => {
  const secondary = ['minerals', 'composites', 'techComponents'] as const;
  return secondary
    .filter(type => (props.resources[type] ?? 0) > 0)
    .map(type => ({
      type,
      amount: props.resources[type] ?? 0,
      def: RESOURCES[type],
    }));
});
</script>

<template>
  <div class="flex items-center gap-1">
    <!-- Primary resources (always shown) -->
    <div
      v-for="{ type, amount, def } in primaryResources"
      :key="type"
      class="flex items-center gap-1 px-2 py-1 rounded bg-gray-800/50"
      :title="def.name"
    >
      <span class="text-sm">{{ def.icon }}</span>
      <span class="text-sm font-medium text-gray-200">{{ formatAmount(amount) }}</span>
    </div>

    <!-- Separator if there are secondary resources -->
    <div v-if="secondaryResources.length > 0" class="w-px h-4 bg-gray-700 mx-1" />

    <!-- Secondary resources (only if player has them) -->
    <div
      v-for="{ type, amount, def } in secondaryResources"
      :key="type"
      class="flex items-center gap-1 px-2 py-1 rounded bg-gray-800/30"
      :title="def.name"
    >
      <span class="text-sm">{{ def.icon }}</span>
      <span class="text-xs text-gray-300">{{ formatAmount(amount) }}</span>
    </div>
  </div>
</template>
