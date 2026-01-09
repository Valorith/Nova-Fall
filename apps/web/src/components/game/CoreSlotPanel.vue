<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  NODE_CORES,
  getCoreForNodeType,
  type NodeCoreId,
  type ItemStorage,
  NodeType,
} from '@nova-fall/shared';
import { useAuthStore } from '@/stores/auth';

const props = defineProps<{
  nodeId: string;
  nodeType: string;
  installedCoreId: string | null;
  storage: ItemStorage;
  isOwned: boolean;
}>();

const emit = defineEmits<{
  (e: 'install', coreId: NodeCoreId, storage: ItemStorage): void;
  (e: 'destroy', storage: ItemStorage): void;
}>();

const authStore = useAuthStore();
const loading = ref(false);
const error = ref<string | null>(null);
const showDestroyConfirm = ref(false);

// Get the core type required for this node
const requiredCoreId = computed(() => {
  return getCoreForNodeType(props.nodeType as NodeType);
});

// Get the installed core definition
const installedCore = computed(() => {
  if (!props.installedCoreId) return null;
  return NODE_CORES[props.installedCoreId as NodeCoreId];
});

// Check if node has matching core in storage
const hasMatchingCoreInStorage = computed(() => {
  if (!requiredCoreId.value) return false;
  return (props.storage[requiredCoreId.value] ?? 0) > 0;
});

// Count of matching cores in storage
const coresInStorage = computed(() => {
  if (!requiredCoreId.value) return 0;
  return props.storage[requiredCoreId.value] ?? 0;
});

// Required core definition
const requiredCore = computed(() => {
  if (!requiredCoreId.value) return null;
  return NODE_CORES[requiredCoreId.value];
});

// Handle install
async function handleInstall() {
  if (loading.value || !requiredCoreId.value) return;

  loading.value = true;
  error.value = null;

  try {
    const response = await fetch(`/api/nodes/${props.nodeId}/cores/install`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.accessToken}`,
      },
      body: JSON.stringify({ coreId: requiredCoreId.value }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to install core');
    }

    emit('install', requiredCoreId.value, data.storage as ItemStorage);
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
          class="w-12 h-12 flex items-center justify-center rounded-lg text-2xl"
          :style="{ backgroundColor: installedCore.color + '20', color: installedCore.color }"
        >
          {{ installedCore.icon }}
        </div>
        <div class="flex-1">
          <p class="font-medium text-white">{{ installedCore.name }}</p>
          <p class="text-xs text-green-400">Producing resources</p>
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
            Requires: <span class="text-gray-300">{{ requiredCore?.name ?? 'Unknown' }}</span>
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
      <div v-if="isOwned && !installedCoreId && hasMatchingCoreInStorage && !showDestroyConfirm" class="mt-3 pt-3 border-t border-gray-700">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-sm">
            <span :style="{ color: requiredCore?.color }">{{ requiredCore?.icon }}</span>
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
          Transfer a <span class="text-gray-300">{{ requiredCore?.name }}</span> to this node to activate it.
        </p>
      </div>
    </div>
  </div>
</template>
