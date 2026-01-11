<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { craftingApi } from '@/services/api';
import { useItemsStore } from '@/stores/items';
import { BLUEPRINT_QUALITY_COLORS, type BlueprintQuality } from '@nova-fall/shared';

const props = defineProps<{
  nodeId: string;
  blueprintItemId: string;
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'learned', storage: Record<string, number>): void;
}>();

const itemsStore = useItemsStore();

// State
const loading = ref(false);
const checking = ref(true);
const error = ref<string | null>(null);
const isLearned = ref(false);
const blueprintName = ref<string>('');

// Get item display info
const itemDisplay = itemsStore.getItemDisplay(props.blueprintItemId);

// Get the linked blueprint ID from the item definition
const itemDef = itemsStore.getItem(props.blueprintItemId);
const linkedBlueprintId = itemDef?.linkedBlueprintId;

// Get quality color
function getQualityColor(quality: string): string {
  return BLUEPRINT_QUALITY_COLORS[quality as BlueprintQuality] || '#FFFFFF';
}

// Check if blueprint is already learned
async function checkLearned() {
  if (!linkedBlueprintId) {
    error.value = 'This item is not linked to a blueprint';
    checking.value = false;
    return;
  }

  checking.value = true;
  error.value = null;

  try {
    const response = await craftingApi.checkBlueprintLearned(linkedBlueprintId);
    isLearned.value = response.data.learned;
    blueprintName.value = response.data.blueprintName || itemDisplay.name;
  } catch (err) {
    const axiosError = err as { response?: { data?: { message?: string } } };
    error.value = axiosError.response?.data?.message || 'Failed to check blueprint status';
  } finally {
    checking.value = false;
  }
}

// Learn the blueprint
async function learnBlueprint() {
  loading.value = true;
  error.value = null;

  try {
    const response = await craftingApi.learnBlueprint(props.nodeId, props.blueprintItemId);

    if (response.data.alreadyLearned) {
      isLearned.value = true;
    } else if (response.data.storage) {
      emit('learned', response.data.storage);
      emit('close');
    }
  } catch (err) {
    const axiosError = err as { response?: { data?: { message?: string } } };
    error.value = axiosError.response?.data?.message || 'Failed to learn blueprint';
  } finally {
    loading.value = false;
  }
}

// Check on mount and when modal opens
onMounted(() => {
  if (props.isOpen) {
    checkLearned();
  }
});

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    checkLearned();
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        @click.self="emit('close')"
      >
        <div class="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-md p-6">
          <!-- Header -->
          <div class="flex items-center gap-3 mb-4">
            <div class="w-12 h-12 flex items-center justify-center bg-gray-800 rounded-lg">
              <template v-if="itemDisplay.icon && itemsStore.isIconUrl(itemDisplay.icon)">
                <img
                  :src="itemDisplay.icon"
                  :alt="itemDisplay.name"
                  class="w-10 h-10 object-contain"
                />
              </template>
              <span v-else class="text-3xl">{{ itemDisplay.icon ?? '📜' }}</span>
            </div>
            <div>
              <h3
                class="text-lg font-semibold"
                :style="{ color: getQualityColor(itemDisplay.quality) }"
              >
                {{ itemDisplay.name }}
              </h3>
              <p class="text-sm text-gray-400">Blueprint</p>
            </div>
          </div>

          <!-- Loading state -->
          <div v-if="checking" class="flex items-center justify-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>

          <!-- Error state -->
          <div v-else-if="error" class="mb-4">
            <div class="bg-red-900/30 border border-red-700/50 rounded p-3 text-red-300 text-sm">
              {{ error }}
            </div>
          </div>

          <!-- Already learned -->
          <div v-else-if="isLearned" class="mb-4">
            <div class="bg-green-900/30 border border-green-700/50 rounded p-4 text-center">
              <svg class="w-12 h-12 text-green-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p class="text-green-300 font-medium">Already Learned</p>
              <p class="text-green-400/70 text-sm mt-1">
                You have already learned this blueprint. It's available in your crafting menu.
              </p>
            </div>
          </div>

          <!-- Learn prompt -->
          <div v-else class="mb-4">
            <div class="bg-blue-900/20 border border-blue-700/30 rounded p-4">
              <p class="text-gray-300 mb-3">
                Would you like to learn this blueprint? Once learned, you'll be able to craft
                <span class="font-medium" :style="{ color: getQualityColor(itemDisplay.quality) }">
                  {{ blueprintName || itemDisplay.name }}
                </span>
                for the rest of this game session.
              </p>
              <p class="text-gray-500 text-sm">
                The blueprint item will be consumed when learned.
              </p>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-3">
            <button
              class="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
              @click="emit('close')"
            >
              {{ isLearned ? 'Close' : 'Cancel' }}
            </button>
            <button
              v-if="!checking && !isLearned && !error"
              class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded font-medium text-white transition-colors"
              :disabled="loading"
              @click="learnBlueprint"
            >
              {{ loading ? 'Learning...' : 'Learn Blueprint' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
