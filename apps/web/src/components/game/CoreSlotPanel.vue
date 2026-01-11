<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ItemStorage } from '@nova-fall/shared';
import { useAuthStore } from '@/stores/auth';
import { useItemsStore, type ItemDisplayInfo } from '@/stores/items';

const props = defineProps<{
  nodeId: string;
  nodeType: string;
  installedCoreId: string | null;
  storage: ItemStorage;
  isOwned: boolean;
}>();

const emit = defineEmits<{
  (e: 'install', coreId: string, storage: ItemStorage): void;
  (e: 'destroy', storage: ItemStorage): void;
}>();

const authStore = useAuthStore();
const itemsStore = useItemsStore();
const loading = ref(false);
const error = ref<string | null>(null);
const showDestroyConfirm = ref(false);

// Get all cores that can be installed in this node type (from database)
const validCoresForNodeType = computed(() => {
  const allCores = itemsStore.getItemsByCategory('NODE_CORE');
  return allCores.filter(core => core.targetNodeType === props.nodeType);
});

// Find a valid core in storage that can be installed
const availableCoreInStorage = computed<{ coreId: string; count: number; display: ItemDisplayInfo } | null>(() => {
  for (const core of validCoresForNodeType.value) {
    const count = props.storage[core.itemId] ?? 0;
    if (count > 0) {
      return {
        coreId: core.itemId,
        count,
        display: itemsStore.getItemDisplay(core.itemId),
      };
    }
  }
  return null;
});

// Get the installed core display info
const installedCore = computed(() => {
  if (!props.installedCoreId) return null;
  return itemsStore.getItemDisplay(props.installedCoreId);
});

// Get the installed core's efficiency
const installedCoreEfficiency = computed(() => {
  if (!props.installedCoreId) return 1;
  const item = itemsStore.getItem(props.installedCoreId);
  return item?.efficiency ?? 1;
});

// Calculate efficiency bonus percentage (10% per point above 1)
const efficiencyBonus = computed(() => {
  const bonus = (installedCoreEfficiency.value - 1) * 10;
  return bonus > 0 ? `+${bonus}%` : '';
});

// Check if node has any matching core in storage
const hasMatchingCoreInStorage = computed(() => {
  return availableCoreInStorage.value !== null;
});

// Count of matching cores in storage
const coresInStorage = computed(() => {
  return availableCoreInStorage.value?.count ?? 0;
});

// Required core info (first valid core type for display)
const requiredCore = computed(() => {
  const firstValidCore = validCoresForNodeType.value[0];
  if (!firstValidCore) return null;
  return itemsStore.getItemDisplay(firstValidCore.itemId);
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
      return 'text-gray-300';
  }
}

// Core ID to install (from available in storage)
const coreIdToInstall = computed(() => {
  return availableCoreInStorage.value?.coreId ?? null;
});

// Handle install
async function handleInstall() {
  if (loading.value || !coreIdToInstall.value) return;

  loading.value = true;
  error.value = null;

  try {
    const response = await fetch(`/api/nodes/${props.nodeId}/cores/install`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.accessToken}`,
      },
      body: JSON.stringify({ coreId: coreIdToInstall.value }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to install core');
    }

    emit('install', coreIdToInstall.value, data.storage as ItemStorage);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Install failed';
    setTimeout(() => error.value = null, 3000);
  } finally {
    loading.value = false;
  }
}

// Handle destroy
async function handleDestroy() {
  if (loading.value) return;

  loading.value = true;
  error.value = null;
  showDestroyConfirm.value = false;

  try {
    const response = await fetch(`/api/nodes/${props.nodeId}/cores`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authStore.accessToken}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to destroy core');
    }

    emit('destroy', data.storage as ItemStorage);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Destroy failed';
    setTimeout(() => error.value = null, 3000);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <h4 class="text-sm font-medium text-gray-400 uppercase tracking-wide flex items-center gap-2">
        <span>⚙️</span>
        <span>Node Core</span>
      </h4>
      <span
        v-if="installedCoreId"
        class="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded border border-green-500/30"
      >
        Active
      </span>
      <span
        v-else
        class="text-xs px-2 py-0.5 bg-gray-700/50 text-gray-400 rounded border border-gray-600/30"
      >
        Inactive
      </span>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="bg-red-900/50 border border-red-500/50 rounded px-3 py-2 text-sm text-red-300">
      {{ error }}
    </div>

    <!-- Core Slot -->
    <div class="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
      <!-- Installed Core -->
      <div v-if="installedCore" class="flex items-center gap-3">
        <div
          class="w-12 h-12 flex items-center justify-center rounded-lg text-2xl overflow-hidden"
          :style="{ backgroundColor: installedCore.color + '20', color: installedCore.color }"
        >
          <img
            v-if="itemsStore.isIconUrl(installedCore.icon)"
            :src="installedCore.icon!"
            :alt="installedCore.name"
            class="w-10 h-10 object-contain"
          />
          <span v-else>{{ installedCore.icon ?? '⚙️' }}</span>
        </div>
        <div class="flex-1">
          <p class="font-medium" :class="getQualityColorClass(installedCore.quality)">{{ installedCore.name }}</p>
          <p class="text-xs text-green-400">Producing resources</p>
          <p class="text-xs text-gray-400">
            Efficiency: {{ installedCoreEfficiency }}
            <span v-if="efficiencyBonus" class="text-green-400">({{ efficiencyBonus }})</span>
          </p>
        </div>
        <button
          v-if="isOwned && !showDestroyConfirm"
          class="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
          @click="showDestroyConfirm = true"
        >
          Destroy
        </button>
      </div>

      <!-- Empty Slot -->
      <div v-else class="flex items-center gap-3">
        <div class="w-12 h-12 flex items-center justify-center rounded-lg bg-gray-700/50 text-gray-500 text-2xl border-2 border-dashed border-gray-600">
          ?
        </div>
        <div class="flex-1">
          <p class="font-medium text-gray-400">No Core Installed</p>
          <p class="text-xs text-gray-500">
            Requires: <span class="text-gray-300">{{ requiredCore?.name ?? 'A core for this node type' }}</span>
          </p>
        </div>
      </div>

      <!-- Destroy Confirmation -->
      <div v-if="showDestroyConfirm" class="mt-3 pt-3 border-t border-gray-700">
        <p class="text-sm text-red-300 mb-2">
          Are you sure? The core will be permanently destroyed.
        </p>
        <div class="flex gap-2">
          <button
            :disabled="loading"
            class="flex-1 px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded transition-colors disabled:opacity-50"
            @click="handleDestroy"
          >
            {{ loading ? 'Destroying...' : 'Confirm Destroy' }}
          </button>
          <button
            :disabled="loading"
            class="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
            @click="showDestroyConfirm = false"
          >
            Cancel
          </button>
        </div>
      </div>

      <!-- Install Option (only if owned, no core installed, and has matching core in storage) -->
      <div v-if="isOwned && !installedCoreId && hasMatchingCoreInStorage && availableCoreInStorage && !showDestroyConfirm" class="mt-3 pt-3 border-t border-gray-700">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-sm">
            <template v-if="itemsStore.isIconUrl(availableCoreInStorage.display.icon)">
              <img :src="availableCoreInStorage.display.icon!" :alt="availableCoreInStorage.display.name" class="w-4 h-4" />
            </template>
            <span v-else :style="{ color: availableCoreInStorage.display.color }">{{ availableCoreInStorage.display.icon ?? '⚙️' }}</span>
            <span class="text-gray-300">{{ coresInStorage }} in storage</span>
          </div>
          <button
            :disabled="loading"
            class="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 text-white rounded transition-colors disabled:opacity-50"
            @click="handleInstall"
          >
            {{ loading ? 'Installing...' : 'Install Core' }}
          </button>
        </div>
      </div>

      <!-- No Core Available Message -->
      <div v-if="isOwned && !installedCoreId && !hasMatchingCoreInStorage && !showDestroyConfirm" class="mt-3 pt-3 border-t border-gray-700">
        <p class="text-xs text-gray-500">
          Transfer a <span class="text-gray-300">{{ requiredCore?.name ?? 'matching core' }}</span> to this node to activate it.
        </p>
      </div>
    </div>
  </div>
</template>
