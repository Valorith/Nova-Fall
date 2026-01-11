<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { ItemStorage } from '@nova-fall/shared';
import { BLUEPRINT_QUALITY_COLORS, type BlueprintQuality } from '@nova-fall/shared';
import { useAuthStore } from '@/stores/auth';
import { nodesApi, type CoreDefinition } from '@/services/api';

const props = defineProps<{
  nodeId: string;
  storage: ItemStorage;
  playerCredits: number;
}>();

const emit = defineEmits<{
  (e: 'purchase', coreId: string, storage: ItemStorage, creditsRemaining: number): void;
}>();

const authStore = useAuthStore();
const purchasing = ref<string | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);
const cores = ref<CoreDefinition[]>([]);

// Load cores from database
async function loadCores() {
  loading.value = true;
  try {
    const response = await nodesApi.getCores();
    cores.value = response.data.cores;
  } catch (err) {
    console.error('Failed to load cores:', err);
    error.value = 'Failed to load cores';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadCores();
});

// Get inventory count for a core type
function getCoreCount(coreId: string): number {
  return props.storage[coreId] ?? 0;
}

// Check if player can afford a core
function canAfford(core: CoreDefinition): boolean {
  return props.playerCredits >= core.cost;
}

// Handle purchase
async function handlePurchase(core: CoreDefinition) {
  if (purchasing.value) return;

  if (!canAfford(core)) {
    error.value = `Not enough credits. Need ${core.cost}`;
    setTimeout(() => error.value = null, 3000);
    return;
  }

  purchasing.value = core.itemId;
  error.value = null;

  try {
    const response = await fetch(`/api/nodes/${props.nodeId}/cores/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.accessToken}`,
      },
      body: JSON.stringify({ coreId: core.itemId }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to purchase core');
    }

    emit('purchase', core.itemId, data.storage as ItemStorage, data.creditsRemaining as number);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Purchase failed';
    setTimeout(() => error.value = null, 3000);
  } finally {
    purchasing.value = null;
  }
}

// Format target node type for display
function formatNodeType(type: string | null): string {
  if (!type) return 'Unknown';
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Check if icon is a URL/path (uploaded image) or emoji
function isIconUrl(icon: string | null): boolean {
  if (!icon) return false;
  return icon.startsWith('/') || icon.startsWith('http');
}

// Get quality color for item name
function getQualityColor(quality: string): string {
  return BLUEPRINT_QUALITY_COLORS[quality as BlueprintQuality] || '#ffffff';
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

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <svg class="animate-spin h-6 w-6 text-yellow-400" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>

    <!-- Error Message -->
    <div v-else-if="error && cores.length === 0" class="bg-red-900/50 border border-red-500/50 rounded px-3 py-2 text-sm text-red-300">
      {{ error }}
    </div>

    <!-- No Cores Available -->
    <div v-else-if="cores.length === 0" class="text-center py-8 text-gray-400 text-sm">
      No cores available. Configure cores in the Item Editor.
    </div>

    <!-- Core List -->
    <template v-else>
      <!-- Error Message (when cores exist) -->
      <div v-if="error" class="bg-red-900/50 border border-red-500/50 rounded px-3 py-2 text-sm text-red-300">
        {{ error }}
      </div>

      <div class="space-y-2">
        <div
          v-for="core in cores"
          :key="core.itemId"
          class="bg-gray-800/50 rounded p-3 border border-gray-700/50 hover:border-gray-600/50 transition-colors"
        >
          <div class="flex items-start gap-3">
            <!-- Core Icon -->
            <div
              class="w-10 h-10 flex items-center justify-center rounded-lg text-xl overflow-hidden"
              :style="{ backgroundColor: core.color + '20', color: core.color }"
            >
              <img
                v-if="isIconUrl(core.icon)"
                :src="core.icon!"
                :alt="core.name"
                class="w-8 h-8 object-contain"
              />
              <span v-else>{{ core.icon || '⚙️' }}</span>
            </div>

            <!-- Core Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium" :style="{ color: getQualityColor(core.quality) }">{{ core.name }}</span>
                <span
                  v-if="getCoreCount(core.itemId) > 0"
                  class="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-300 rounded"
                >
                  {{ getCoreCount(core.itemId) }} in storage
                </span>
              </div>
              <p v-if="core.description" class="text-xs text-gray-400 mt-0.5">{{ core.description }}</p>
              <p class="text-xs text-gray-500 mt-1">
                For: <span class="text-gray-300">{{ formatNodeType(core.targetNodeType) }}</span>
              </p>
            </div>

            <!-- Purchase Button -->
            <div class="flex flex-col items-end gap-1">
              <button
                :disabled="!canAfford(core) || purchasing === core.itemId"
                class="px-3 py-1.5 text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                :class="canAfford(core)
                  ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                  : 'bg-gray-700 text-gray-400'"
                @click="handlePurchase(core)"
              >
                <span v-if="purchasing === core.itemId" class="flex items-center gap-1">
                  <svg class="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Buying...
                </span>
                <span v-else class="flex items-center gap-1">
                  <span>💰</span>
                  <span>{{ core.cost }}</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
