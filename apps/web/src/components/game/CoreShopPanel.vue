<script setup lang="ts">
import { ref } from 'vue';
import { NODE_CORES, NODE_CORE_IDS, type NodeCoreId, type ItemStorage } from '@nova-fall/shared';
import { useAuthStore } from '@/stores/auth';

const props = defineProps<{
  nodeId: string;
  storage: ItemStorage;
  playerCredits: number;
}>();

const emit = defineEmits<{
  (e: 'purchase', coreId: NodeCoreId, storage: ItemStorage, creditsRemaining: number): void;
}>();

const authStore = useAuthStore();
const purchasing = ref<string | null>(null);
const error = ref<string | null>(null);

// Get inventory count for a core type
function getCoreCount(coreId: NodeCoreId): number {
  return props.storage[coreId] ?? 0;
}

// Check if player can afford a core
function canAfford(coreId: NodeCoreId): boolean {
  const core = NODE_CORES[coreId];
  return props.playerCredits >= core.cost;
}

// Handle purchase
async function handlePurchase(coreId: NodeCoreId) {
  if (purchasing.value) return;

  const core = NODE_CORES[coreId];
  if (!canAfford(coreId)) {
    error.value = `Not enough credits. Need ${core.cost}`;
    setTimeout(() => error.value = null, 3000);
    return;
  }

  purchasing.value = coreId;
  error.value = null;

  try {
    const response = await fetch(`/api/nodes/${props.nodeId}/cores/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.accessToken}`,
      },
      body: JSON.stringify({ coreId }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to purchase core');
    }

    emit('purchase', coreId, data.storage as ItemStorage, data.creditsRemaining as number);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Purchase failed';
    setTimeout(() => error.value = null, 3000);
  } finally {
    purchasing.value = null;
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h4 class="text-sm font-medium text-yellow-400 uppercase tracking-wide flex items-center gap-2">
        <span>🏭</span>
        <span>Core Shop</span>
      </h4>
      <span class="text-xs text-gray-400">Purchase cores to activate nodes</span>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="bg-red-900/50 border border-red-500/50 rounded px-3 py-2 text-sm text-red-300">
      {{ error }}
    </div>

    <!-- Core List -->
    <div class="space-y-2">
      <div
        v-for="coreId in NODE_CORE_IDS"
        :key="coreId"
        class="bg-gray-800/50 rounded p-3 border border-gray-700/50 hover:border-gray-600/50 transition-colors"
      >
        <div class="flex items-start gap-3">
          <!-- Core Icon -->
          <div
            class="w-10 h-10 flex items-center justify-center rounded-lg text-xl"
            :style="{ backgroundColor: NODE_CORES[coreId].color + '20', color: NODE_CORES[coreId].color }"
          >
            {{ NODE_CORES[coreId].icon }}
          </div>

          <!-- Core Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium text-white">{{ NODE_CORES[coreId].name }}</span>
              <span
                v-if="getCoreCount(coreId) > 0"
                class="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-300 rounded"
              >
                {{ getCoreCount(coreId) }} in storage
              </span>
            </div>
            <p class="text-xs text-gray-400 mt-0.5">{{ NODE_CORES[coreId].description }}</p>
            <p class="text-xs text-gray-500 mt-1">
              For: <span class="text-gray-300">{{ NODE_CORES[coreId].targetNode.replace('_', ' ') }}</span>
            </p>
          </div>

          <!-- Purchase Button -->
          <div class="flex flex-col items-end gap-1">
            <button
              :disabled="!canAfford(coreId) || purchasing === coreId"
              class="px-3 py-1.5 text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              :class="canAfford(coreId)
                ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                : 'bg-gray-700 text-gray-400'"
              @click="handlePurchase(coreId)"
            >
              <span v-if="purchasing === coreId" class="flex items-center gap-1">
                <svg class="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Buying...
              </span>
              <span v-else class="flex items-center gap-1">
                <span>💰</span>
                <span>{{ NODE_CORES[coreId].cost }}</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
