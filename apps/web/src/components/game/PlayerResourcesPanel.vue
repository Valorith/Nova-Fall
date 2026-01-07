<script setup lang="ts">
import { computed, ref } from 'vue';
import { RESOURCES, type ResourceStorage } from '@nova-fall/shared';

export interface UpkeepBreakdownItem {
  nodeName: string;
  nodeType: string;
  amount: number;
}

export interface IncomeBreakdownItem {
  source: string;
  amount: number;
}

const props = defineProps<{
  resources: ResourceStorage;
  totalUpkeep?: number;
  upkeepBreakdown?: UpkeepBreakdownItem[];
  totalIncome?: number;
  incomeBreakdown?: IncomeBreakdownItem[];
}>();

const showCreditsTooltip = ref(false);

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

// Calculate net credit change per hour
const netCreditChange = computed(() => {
  return (props.totalIncome ?? 0) - (props.totalUpkeep ?? 0);
});

// Calculate hours until credits are depleted (only if negative net change)
const hoursUntilDepleted = computed(() => {
  if (netCreditChange.value >= 0) return null;
  const currentCredits = props.resources.credits ?? 0;
  if (currentCredits <= 0) return 0;
  const hourlyLoss = Math.abs(netCreditChange.value);
  if (hourlyLoss === 0) return null;
  return Math.floor(currentCredits / hourlyLoss);
});

// Format depletion time in a human-readable way
const depletionText = computed(() => {
  if (hoursUntilDepleted.value === null) return null;
  if (hoursUntilDepleted.value === 0) return 'Depleted now';
  if (hoursUntilDepleted.value === 1) return 'Depleted in ~1 hour';
  if (hoursUntilDepleted.value < 24) return `Depleted in ~${hoursUntilDepleted.value} hours`;
  const days = Math.floor(hoursUntilDepleted.value / 24);
  if (days === 1) return 'Depleted in ~1 day';
  return `Depleted in ~${days} days`;
});
</script>

<template>
  <div class="flex items-center gap-1">
    <!-- Credits with tooltip -->
    <div
      class="relative flex items-center gap-1 px-2 py-1 rounded bg-gray-800/50 cursor-help"
      @mouseenter="showCreditsTooltip = true"
      @mouseleave="showCreditsTooltip = false"
    >
      <span class="text-sm">{{ RESOURCES.credits.icon }}</span>
      <span class="text-sm font-medium text-gray-200">{{ formatAmount(props.resources.credits ?? 0) }}</span>

      <!-- Credits Tooltip -->
      <div
        v-if="showCreditsTooltip && (props.totalUpkeep !== undefined || props.totalIncome !== undefined)"
        class="absolute top-full left-0 mt-1 z-50 w-64 p-3 rounded-lg bg-gray-900 border border-gray-700 shadow-xl text-xs"
      >
        <div class="font-semibold text-gray-200 mb-2">Credits Breakdown (per hour)</div>

        <!-- Upkeep Section -->
        <div v-if="props.totalUpkeep !== undefined" class="mb-2">
          <div class="flex justify-between text-red-400 font-medium">
            <span>Upkeep Cost</span>
            <span>-{{ props.totalUpkeep.toLocaleString() }}</span>
          </div>
          <div v-if="props.upkeepBreakdown && props.upkeepBreakdown.length > 0" class="mt-1 space-y-0.5 text-gray-400 pl-2">
            <div v-for="(item, idx) in props.upkeepBreakdown.slice(0, 5)" :key="idx" class="flex justify-between">
              <span class="truncate mr-2">{{ item.nodeName }}</span>
              <span>-{{ item.amount }}</span>
            </div>
            <div v-if="props.upkeepBreakdown.length > 5" class="text-gray-500 italic">
              ...and {{ props.upkeepBreakdown.length - 5 }} more nodes
            </div>
          </div>
        </div>

        <!-- Income Section -->
        <div v-if="props.totalIncome !== undefined">
          <div class="flex justify-between text-green-400 font-medium">
            <span>Income</span>
            <span>+{{ props.totalIncome.toLocaleString() }}</span>
          </div>
          <div v-if="props.incomeBreakdown && props.incomeBreakdown.length > 0" class="mt-1 space-y-0.5 text-gray-400 pl-2">
            <div v-for="(item, idx) in props.incomeBreakdown" :key="idx" class="flex justify-between">
              <span class="truncate mr-2">{{ item.source }}</span>
              <span>+{{ item.amount }}</span>
            </div>
          </div>
          <div v-else class="mt-1 text-gray-500 italic pl-2">
            No income sources yet
          </div>
        </div>

        <!-- Net Change -->
        <div v-if="props.totalUpkeep !== undefined || props.totalIncome !== undefined" class="mt-2 pt-2 border-t border-gray-700">
          <div class="flex justify-between font-medium" :class="netCreditChange >= 0 ? 'text-green-300' : 'text-red-300'">
            <span>Net Change</span>
            <span>{{ netCreditChange >= 0 ? '+' : '' }}{{ netCreditChange.toLocaleString() }}/hr</span>
          </div>

          <!-- Depletion Warning -->
          <div v-if="depletionText" class="mt-2 flex items-center gap-1.5 text-amber-400">
            <svg class="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
            </svg>
            <span class="font-medium">{{ depletionText }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Other primary resources (iron, energy) -->
    <template v-for="{ type, amount, def } in primaryResources" :key="type">
      <div
        v-if="type !== 'credits'"
        class="flex items-center gap-1 px-2 py-1 rounded bg-gray-800/50"
        :title="def.name"
      >
        <span class="text-sm">{{ def.icon }}</span>
        <span class="text-sm font-medium text-gray-200">{{ formatAmount(amount) }}</span>
      </div>
    </template>

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
