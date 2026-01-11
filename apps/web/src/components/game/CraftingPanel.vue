<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import { craftingApi } from '@/services/api';
import {
  type Blueprint,
  type CraftingQueue,
  type CraftingQueueItem,
  type ItemStorage,
  type NodeType,
  getCraftingProgress,
  getCraftingRemainingTime,
  getCraftingTotalRemainingTime,
  formatCraftTime,
  BLUEPRINT_QUALITY_COLORS,
  BLUEPRINT_CATEGORY_NAMES,
  type BlueprintQuality,
  type BlueprintCategory,
} from '@nova-fall/shared';
import { useItemsStore } from '@/stores/items';

const itemsStore = useItemsStore();

const props = defineProps<{
  nodeId: string;
  nodeType: NodeType;
  nodeTier: number;
  storage: ItemStorage;
  externalQueue?: CraftingQueue;
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'storageUpdated', storage: ItemStorage, queue?: CraftingQueue): void;
  (e: 'queueUpdated', queue: CraftingQueue): void;
}>();

// State
const blueprints = ref<Blueprint[]>([]);
const craftingQueue = ref<CraftingQueue>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const craftingLoading = ref(false);
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);

// Selected blueprint
const selectedBlueprint = ref<Blueprint | null>(null);
const craftQuantity = ref(1);

// Filter state
const filterCategory = ref<string>('');

// Progress update timer
let progressTimer: ReturnType<typeof setInterval> | null = null;
const now = ref(Date.now());

// Get unique categories from available blueprints
const availableCategories = computed(() => {
  const categories = new Set<string>();
  for (const bp of blueprints.value) {
    categories.add(bp.category);
  }
  return Array.from(categories).sort();
});

// Filtered blueprints
const filteredBlueprints = computed(() => {
  let result = blueprints.value;

  if (filterCategory.value) {
    result = result.filter((bp) => bp.category === filterCategory.value);
  }

  return result;
});

// Check if we have sufficient materials for crafting
function canAfford(blueprint: Blueprint, qty: number): boolean {
  for (const input of blueprint.inputs) {
    const available = props.storage[input.itemId] || 0;
    const needed = input.quantity * qty;
    if (available < needed) {
      return false;
    }
  }
  return true;
}

// Calculate max craftable quantity
function getMaxCraftable(blueprint: Blueprint): number {
  if (blueprint.inputs.length === 0) return 100; // No inputs = can craft any amount

  let maxQty = Infinity;
  for (const input of blueprint.inputs) {
    const available = props.storage[input.itemId] || 0;
    const canCraft = Math.floor(available / input.quantity);
    maxQty = Math.min(maxQty, canCraft);
  }
  return Math.min(maxQty, 100); // Cap at 100
}

// Get quality color
function getQualityColor(quality: BlueprintQuality): string {
  return BLUEPRINT_QUALITY_COLORS[quality] || '#FFFFFF';
}

// Get category name
function getCategoryName(category: BlueprintCategory): string {
  return BLUEPRINT_CATEGORY_NAMES[category] || category;
}

// Load data
async function loadData() {
  loading.value = true;
  error.value = null;

  try {
    const [blueprintsRes, queueRes] = await Promise.all([
      craftingApi.getBlueprintsForNode(props.nodeId),
      craftingApi.getCraftingQueue(props.nodeId),
    ]);

    blueprints.value = blueprintsRes.data.blueprints;
    craftingQueue.value = queueRes.data.queue;
  } catch (err) {
    error.value = 'Failed to load crafting data';
    console.error('Failed to load crafting data:', err);
  } finally {
    loading.value = false;
  }
}

// Start crafting
async function startCrafting() {
  if (!selectedBlueprint.value || craftQuantity.value < 1) return;
  if (!canAfford(selectedBlueprint.value, craftQuantity.value)) return;

  craftingLoading.value = true;
  message.value = null;

  try {
    const response = await craftingApi.startCraft(props.nodeId, {
      blueprintId: selectedBlueprint.value.id,
      quantity: craftQuantity.value,
    });

    craftingQueue.value = response.data.queue;
    // Emit storage and queue together to update atomically and avoid race conditions
    emit('storageUpdated', response.data.storage, response.data.queue);

    const outputName = selectedBlueprint.value.outputs[0]
      ? itemsStore.getItemDisplay(selectedBlueprint.value.outputs[0].itemId).name
      : 'Unknown';
    message.value = {
      type: 'success',
      text: `Started crafting ${craftQuantity.value}x ${outputName}`,
    };

    // Reset quantity
    craftQuantity.value = 1;

    // Clear success message after 3 seconds
    setTimeout(() => {
      if (message.value?.type === 'success') {
        message.value = null;
      }
    }, 3000);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to start crafting';
    message.value = {
      type: 'error',
      text: (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? errorMessage,
    };
  } finally {
    craftingLoading.value = false;
  }
}

// Cancel crafting
async function cancelCraft(queueItemId: string) {
  craftingLoading.value = true;
  message.value = null;

  try {
    const response = await craftingApi.cancelCraft(props.nodeId, queueItemId);

    craftingQueue.value = response.data.queue;
    // Emit storage and queue together to update atomically and avoid race conditions
    emit('storageUpdated', response.data.storage, response.data.queue);

    message.value = {
      type: 'success',
      text: 'Craft cancelled, materials refunded',
    };

    setTimeout(() => {
      if (message.value?.type === 'success') {
        message.value = null;
      }
    }, 3000);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to cancel craft';
    message.value = {
      type: 'error',
      text: (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? errorMessage,
    };
  } finally {
    craftingLoading.value = false;
  }
}

// Format remaining time for current run
function formatRunRemaining(item: CraftingQueueItem): string {
  const remaining = getCraftingRemainingTime(item, now.value);
  if (remaining <= 0) return 'Completing...';
  return formatCraftTime(Math.ceil(remaining / 1000));
}

// Format total remaining time for all runs
function formatTotalRemaining(item: CraftingQueueItem): string {
  const remaining = getCraftingTotalRemainingTime(item, now.value);
  if (remaining <= 0) return 'Completing...';
  return formatCraftTime(Math.ceil(remaining / 1000));
}

// Get output item name for a queue item
function getOutputItemName(blueprintId: string): string {
  const bp = blueprints.value.find((b) => b.id === blueprintId);
  const firstOutput = bp?.outputs[0];
  if (!firstOutput) return 'Unknown';
  return itemsStore.getItemDisplay(firstOutput.itemId).name;
}

// Setup progress timer
function startProgressTimer() {
  if (progressTimer) return;
  progressTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
}

function stopProgressTimer() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

// Load on mount
onMounted(() => {
  if (props.isOpen) {
    loadData();
    startProgressTimer();
  }
});

onUnmounted(() => {
  stopProgressTimer();
});

// Watch for panel open/close
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    loadData();
    startProgressTimer();
    message.value = null;
    selectedBlueprint.value = null;
    craftQuantity.value = 1;
  } else {
    stopProgressTimer();
  }
});

// Watch for storage changes to refresh max craftable
watch(() => props.storage, () => {
  // Storage updated, recalculate availability
}, { deep: true });

// Watch for external queue updates (from WebSocket events)
watch(() => props.externalQueue, (newQueue) => {
  if (newQueue && props.isOpen) {
    // Update local queue with external data
    craftingQueue.value = newQueue;
  }
}, { deep: true });
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
    @click.self="emit('close')"
  >
    <div class="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
        <div>
          <h2 class="text-lg font-semibold text-gray-100">Crafting</h2>
          <p class="text-sm text-gray-400">{{ nodeType }} - Tier {{ nodeTier }}</p>
        </div>
        <button
          class="text-gray-400 hover:text-gray-200 transition-colors"
          @click="emit('close')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-hidden">
        <!-- Loading state -->
        <div v-if="loading" class="flex items-center justify-center py-16">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>

        <!-- Error state -->
        <div v-else-if="error" class="text-center py-16">
          <p class="text-red-400 mb-4">{{ error }}</p>
          <button class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm" @click="loadData">
            Retry
          </button>
        </div>

        <!-- Main content: 3-column layout -->
        <div v-else class="flex h-full">
          <!-- Left: Blueprint list -->
          <div class="w-1/3 border-r border-gray-700 flex flex-col">
            <!-- Category filter -->
            <div class="p-3 border-b border-gray-700/50">
              <select
                v-model="filterCategory"
                class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Categories</option>
                <option v-for="cat in availableCategories" :key="cat" :value="cat">
                  {{ getCategoryName(cat as BlueprintCategory) }}
                </option>
              </select>
            </div>

            <!-- Blueprint list -->
            <div class="flex-1 overflow-y-auto p-2">
              <div v-if="filteredBlueprints.length === 0" class="text-center py-8 text-gray-500 text-sm">
                No blueprints available
              </div>
              <div
                v-for="bp in filteredBlueprints"
                :key="bp.id"
                class="p-2 mb-1 rounded cursor-pointer transition-colors"
                :class="selectedBlueprint?.id === bp.id
                  ? 'bg-blue-900/40 border border-blue-500'
                  : 'hover:bg-gray-800 border border-transparent'"
                @click="selectedBlueprint = bp; craftQuantity = 1"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <template v-if="bp.icon && itemsStore.isIconUrl(bp.icon)">
                      <img
                        :src="bp.icon"
                        :alt="bp.name"
                        class="w-5 h-5 object-contain shrink-0"
                      />
                    </template>
                    <span v-else class="text-base shrink-0">{{ bp.icon ?? '📋' }}</span>
                    <span
                      class="font-medium text-sm truncate"
                      :style="{ color: getQualityColor(bp.quality) }"
                    >
                      {{ bp.name }}
                    </span>
                  </div>
                  <span
                    class="text-xs px-1.5 py-0.5 rounded shrink-0 ml-2"
                    :class="canAfford(bp, 1) ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'"
                  >
                    {{ canAfford(bp, 1) ? 'Ready' : 'Missing' }}
                  </span>
                </div>
                <div class="text-xs text-gray-500 mt-0.5">
                  {{ getCategoryName(bp.category) }} - {{ formatCraftTime(bp.craftTime) }}
                </div>
              </div>
            </div>
          </div>

          <!-- Middle: Selected blueprint details -->
          <div class="w-1/3 border-r border-gray-700 flex flex-col">
            <div v-if="!selectedBlueprint" class="flex-1 flex items-center justify-center text-gray-500 text-sm">
              Select a blueprint
            </div>
            <div v-else class="flex-1 overflow-y-auto p-4">
              <!-- Blueprint header -->
              <div class="mb-4">
                <div class="flex items-center gap-2">
                  <template v-if="selectedBlueprint.icon && itemsStore.isIconUrl(selectedBlueprint.icon)">
                    <img
                      :src="selectedBlueprint.icon"
                      :alt="selectedBlueprint.name"
                      class="w-8 h-8 object-contain"
                    />
                  </template>
                  <span v-else class="text-2xl">{{ selectedBlueprint.icon ?? '📋' }}</span>
                  <div>
                    <h3
                      class="text-lg font-semibold"
                      :style="{ color: getQualityColor(selectedBlueprint.quality) }"
                    >
                      {{ selectedBlueprint.name }}
                    </h3>
                    <p class="text-xs text-gray-500">
                      {{ getCategoryName(selectedBlueprint.category) }}
                    </p>
                  </div>
                </div>
              </div>

              <!-- Inputs (Materials required) -->
              <div class="mb-4">
                <h4 class="text-sm font-medium text-gray-300 mb-2">Materials Required</h4>
                <div v-if="selectedBlueprint.inputs.length === 0" class="text-sm text-gray-500">
                  No materials required
                </div>
                <div v-else class="space-y-1.5">
                  <div
                    v-for="input in selectedBlueprint.inputs"
                    :key="input.itemId"
                    class="flex items-center justify-between text-sm"
                  >
                    <div class="flex items-center gap-1.5">
                      <template v-if="itemsStore.isIconUrl(itemsStore.getItemDisplay(input.itemId).icon)">
                        <img
                          :src="itemsStore.getItemDisplay(input.itemId).icon!"
                          :alt="itemsStore.getItemDisplay(input.itemId).name"
                          class="w-4 h-4 object-contain"
                        />
                      </template>
                      <span
                        v-else
                        class="w-4 h-4 flex items-center justify-center text-xs"
                      >
                        {{ itemsStore.getItemDisplay(input.itemId).icon ?? '📦' }}
                      </span>
                      <span :style="{ color: getQualityColor(itemsStore.getItemDisplay(input.itemId).quality as BlueprintQuality) }">
                        {{ itemsStore.getItemDisplay(input.itemId).name }}
                      </span>
                    </div>
                    <span
                      :class="(storage[input.itemId] || 0) >= input.quantity * craftQuantity
                        ? 'text-green-400'
                        : 'text-red-400'"
                    >
                      {{ storage[input.itemId] || 0 }} / {{ input.quantity * craftQuantity }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Outputs -->
              <div class="mb-4">
                <h4 class="text-sm font-medium text-gray-300 mb-2">Output</h4>
                <div v-if="selectedBlueprint.outputs.length === 0" class="text-sm text-gray-500">
                  No output defined
                </div>
                <div v-else class="space-y-1.5">
                  <div
                    v-for="output in selectedBlueprint.outputs"
                    :key="output.itemId"
                    class="flex items-center justify-between text-sm"
                  >
                    <div class="flex items-center gap-1.5">
                      <template v-if="itemsStore.isIconUrl(itemsStore.getItemDisplay(output.itemId).icon)">
                        <img
                          :src="itemsStore.getItemDisplay(output.itemId).icon!"
                          :alt="itemsStore.getItemDisplay(output.itemId).name"
                          class="w-4 h-4 object-contain"
                        />
                      </template>
                      <span
                        v-else
                        class="w-4 h-4 flex items-center justify-center text-xs"
                      >
                        {{ itemsStore.getItemDisplay(output.itemId).icon ?? '📦' }}
                      </span>
                      <span :style="{ color: getQualityColor(itemsStore.getItemDisplay(output.itemId).quality as BlueprintQuality) }">
                        {{ itemsStore.getItemDisplay(output.itemId).name }}
                      </span>
                    </div>
                    <span class="text-blue-400">+{{ output.quantity * craftQuantity }}</span>
                  </div>
                </div>
              </div>

              <!-- Craft time -->
              <div class="mb-4">
                <h4 class="text-sm font-medium text-gray-300 mb-1">Craft Time</h4>
                <p class="text-sm text-gray-400">
                  {{ formatCraftTime(selectedBlueprint.craftTime * craftQuantity) }}
                </p>
              </div>

              <!-- Quantity selector -->
              <div class="mb-4">
                <h4 class="text-sm font-medium text-gray-300 mb-2">Quantity</h4>
                <div class="flex items-center gap-2">
                  <button
                    class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
                    :disabled="craftQuantity <= 1"
                    @click="craftQuantity = Math.max(1, craftQuantity - 1)"
                  >
                    -
                  </button>
                  <input
                    v-model.number="craftQuantity"
                    type="number"
                    min="1"
                    :max="getMaxCraftable(selectedBlueprint)"
                    class="w-16 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-center text-gray-200 focus:outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
                    :disabled="craftQuantity >= getMaxCraftable(selectedBlueprint)"
                    @click="craftQuantity = Math.min(getMaxCraftable(selectedBlueprint), craftQuantity + 1)"
                  >
                    +
                  </button>
                  <button
                    class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-300"
                    @click="craftQuantity = getMaxCraftable(selectedBlueprint)"
                  >
                    Max
                  </button>
                </div>
                <p class="text-xs text-gray-500 mt-1">
                  Max: {{ getMaxCraftable(selectedBlueprint) }}
                </p>
              </div>

              <!-- Message -->
              <div
                v-if="message"
                class="mb-4 px-3 py-2 rounded text-sm"
                :class="message.type === 'success'
                  ? 'bg-green-900/30 text-green-300 border border-green-700/50'
                  : 'bg-red-900/30 text-red-300 border border-red-700/50'"
              >
                {{ message.text }}
              </div>

              <!-- Craft button -->
              <button
                :disabled="!canAfford(selectedBlueprint, craftQuantity) || craftingLoading || selectedBlueprint.outputs.length === 0"
                class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded font-medium text-white transition-colors"
                @click="startCrafting"
              >
                <span v-if="craftingLoading">Processing...</span>
                <span v-else-if="selectedBlueprint.outputs.length === 0">No Output Defined</span>
                <span v-else-if="!canAfford(selectedBlueprint, craftQuantity)">Insufficient Materials</span>
                <span v-else>Craft {{ craftQuantity }}x {{ itemsStore.getItemDisplay(selectedBlueprint.outputs[0]?.itemId ?? '').name }}</span>
              </button>
            </div>
          </div>

          <!-- Right: Crafting queue -->
          <div class="w-1/3 flex flex-col">
            <div class="p-3 border-b border-gray-700/50">
              <h3 class="text-sm font-medium text-gray-300">Crafting Queue</h3>
            </div>
            <div class="flex-1 overflow-y-auto p-2">
              <div v-if="craftingQueue.length === 0" class="text-center py-8 text-gray-500 text-sm">
                No active crafts
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="(item, index) in craftingQueue"
                  :key="item.id"
                  class="p-3 bg-gray-800 rounded-lg border border-gray-700"
                >
                  <div class="flex items-center justify-between mb-2">
                    <span class="font-medium text-gray-200 text-sm">
                      {{ getOutputItemName(item.blueprintId) }} x {{ item.quantity }}
                    </span>
                    <button
                      class="text-red-400 hover:text-red-300 text-xs"
                      :disabled="craftingLoading"
                      @click="cancelCraft(item.id)"
                    >
                      Cancel
                    </button>
                  </div>

                  <!-- Progress bar for first item (active) - shows current run progress -->
                  <div v-if="index === 0" class="mb-1">
                    <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        class="h-full bg-blue-500 transition-all duration-1000"
                        :style="{ width: `${getCraftingProgress(item, now)}%` }"
                      ></div>
                    </div>
                    <div class="flex justify-between text-xs text-gray-500 mt-0.5">
                      <span>Run {{ item.completedRuns + 1 }} of {{ item.quantity }}</span>
                      <span>{{ formatRunRemaining(item) }}</span>
                    </div>
                  </div>

                  <div class="flex items-center justify-between text-xs">
                    <span v-if="index === 0" class="text-blue-400">Active</span>
                    <span v-else class="text-gray-500">Queued #{{ index }}</span>
                    <span class="text-gray-400">Total: {{ formatTotalRemaining(item) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
