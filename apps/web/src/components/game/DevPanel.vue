<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { type ResourceStorage, type ItemStorage, BLUEPRINT_QUALITY_COLORS, type BlueprintQuality } from '@nova-fall/shared';
import { useItemsStore } from '@/stores/items';
import { nodesApi } from '@/services/api';

const props = defineProps<{
  resources: ResourceStorage;
  canClaimNode?: boolean;
  selectedNodeName?: string;
  selectedNodeId?: string | null;
  isNodeOwned?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:resources', resources: ResourceStorage): void;
  (e: 'claim-free'): void;
  (e: 'item-added', storage: ItemStorage): void;
}>();

const itemsStore = useItemsStore();

const isOpen = ref(false);

// Local editable values
const credits = ref(props.resources.credits ?? 0);
const iron = ref(props.resources.iron ?? 0);
const energy = ref(props.resources.energy ?? 0);
const minerals = ref(props.resources.minerals ?? 0);
const composites = ref(props.resources.composites ?? 0);

// Item add feature
const itemSearchQuery = ref('');
const itemQuantity = ref(1);
const showItemDropdown = ref(false);
const isAddingItem = ref(false);
const addItemError = ref<string | null>(null);

// Get all items for search
const allItems = computed(() => {
  return itemsStore.getAllItems();
});

// Filter items based on search query
const filteredItems = computed(() => {
  if (!itemSearchQuery.value.trim()) {
    return allItems.value.slice(0, 20); // Show first 20 when no search
  }
  const query = itemSearchQuery.value.toLowerCase();
  return allItems.value
    .filter(item =>
      item.name.toLowerCase().includes(query) ||
      item.itemId.toLowerCase().includes(query)
    )
    .slice(0, 20);
});

// Selected item from dropdown
const selectedItem = ref<{ itemId: string; name: string; quality: BlueprintQuality } | null>(null);

function togglePanel() {
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    // Sync local values with props when opening
    credits.value = props.resources.credits ?? 0;
    iron.value = props.resources.iron ?? 0;
    energy.value = props.resources.energy ?? 0;
    minerals.value = props.resources.minerals ?? 0;
    composites.value = props.resources.composites ?? 0;
    // Reset item add state
    itemSearchQuery.value = '';
    selectedItem.value = null;
    itemQuantity.value = 1;
    addItemError.value = null;
  }
}

function applyChanges() {
  emit('update:resources', {
    credits: credits.value,
    iron: iron.value,
    energy: energy.value,
    minerals: minerals.value,
    composites: composites.value,
  });
}

function addCredits(amount: number) {
  credits.value = Math.max(0, credits.value + amount);
  applyChanges();
}

function selectItem(item: { itemId: string; name: string; quality: BlueprintQuality }) {
  selectedItem.value = item;
  itemSearchQuery.value = item.name;
  showItemDropdown.value = false;
}

function clearSelectedItem() {
  selectedItem.value = null;
  itemSearchQuery.value = '';
}

// Get quality color for item
function getQualityColor(quality: BlueprintQuality): string {
  return BLUEPRINT_QUALITY_COLORS[quality] || '#FFFFFF';
}

async function addItemToNode() {
  if (!selectedItem.value || !props.selectedNodeId || itemQuantity.value <= 0) return;

  isAddingItem.value = true;
  addItemError.value = null;

  try {
    const response = await nodesApi.devAddItem(
      props.selectedNodeId,
      selectedItem.value.itemId,
      itemQuantity.value
    );

    // Emit event with updated storage
    emit('item-added', response.data.storage as ItemStorage);

    // Reset form
    selectedItem.value = null;
    itemSearchQuery.value = '';
    itemQuantity.value = 1;
  } catch (err) {
    const axiosError = err as { response?: { data?: { message?: string } } };
    addItemError.value = axiosError.response?.data?.message || (err instanceof Error ? err.message : 'Failed to add item');
    setTimeout(() => addItemError.value = null, 3000);
  } finally {
    isAddingItem.value = false;
  }
}

// Close dropdown when clicking outside
function handleSearchBlur() {
  // Delay to allow click on dropdown item
  setTimeout(() => {
    showItemDropdown.value = false;
  }, 200);
}

// Watch for search input to show dropdown
watch(itemSearchQuery, (newValue) => {
  if (newValue && !selectedItem.value) {
    showItemDropdown.value = true;
  }
});
</script>

<template>
  <div class="dev-panel">
    <!-- Toggle Button -->
    <button
      class="dev-panel__toggle"
      :class="{ 'dev-panel__toggle--active': isOpen }"
      title="Dev Panel"
      @click="togglePanel"
    >
      <svg class="dev-panel__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    </button>

    <!-- Panel -->
    <Transition name="slide">
      <div v-if="isOpen" class="dev-panel__content">
        <div class="dev-panel__header">
          <span class="dev-panel__title">Dev Panel</span>
          <button class="dev-panel__close" @click="isOpen = false">&times;</button>
        </div>

        <div class="dev-panel__section">
          <h4 class="dev-panel__section-title">Resources</h4>

          <!-- Credits -->
          <div class="dev-panel__field">
            <label class="dev-panel__label">Credits</label>
            <div class="dev-panel__input-group">
              <input
                v-model.number="credits"
                type="number"
                class="dev-panel__input"
                min="0"
                @change="applyChanges"
              />
              <button class="dev-panel__btn dev-panel__btn--small" @click="addCredits(100)">+100</button>
              <button class="dev-panel__btn dev-panel__btn--small" @click="addCredits(1000)">+1k</button>
            </div>
          </div>

          <!-- Iron -->
          <div class="dev-panel__field">
            <label class="dev-panel__label">Iron</label>
            <input
              v-model.number="iron"
              type="number"
              class="dev-panel__input"
              min="0"
              @change="applyChanges"
            />
          </div>

          <!-- Energy -->
          <div class="dev-panel__field">
            <label class="dev-panel__label">Energy</label>
            <input
              v-model.number="energy"
              type="number"
              class="dev-panel__input"
              min="0"
              @change="applyChanges"
            />
          </div>

          <!-- Minerals -->
          <div class="dev-panel__field">
            <label class="dev-panel__label">Minerals</label>
            <input
              v-model.number="minerals"
              type="number"
              class="dev-panel__input"
              min="0"
              @change="applyChanges"
            />
          </div>

          <!-- Composites -->
          <div class="dev-panel__field">
            <label class="dev-panel__label">Composites</label>
            <input
              v-model.number="composites"
              type="number"
              class="dev-panel__input"
              min="0"
              @change="applyChanges"
            />
          </div>
        </div>

        <div class="dev-panel__section">
          <h4 class="dev-panel__section-title">Quick Actions</h4>
          <div class="dev-panel__actions">
            <button class="dev-panel__btn" @click="addCredits(10000)">+10k Credits</button>
          </div>
        </div>

        <!-- Add Item to Node -->
        <div v-if="selectedNodeId && isNodeOwned" class="dev-panel__section">
          <h4 class="dev-panel__section-title">Add Item to Node</h4>
          <p class="dev-panel__node-name">{{ selectedNodeName }}</p>

          <!-- Error -->
          <div v-if="addItemError" class="dev-panel__error">
            {{ addItemError }}
          </div>

          <!-- Item Search -->
          <div class="dev-panel__field">
            <label class="dev-panel__label">Item</label>
            <div class="dev-panel__search-wrapper">
              <div v-if="selectedItem" class="dev-panel__selected-item">
                <span :style="{ color: getQualityColor(selectedItem.quality) }">{{ selectedItem.name }}</span>
                <button class="dev-panel__clear-btn" @click="clearSelectedItem">&times;</button>
              </div>
              <input
                v-else
                v-model="itemSearchQuery"
                type="text"
                class="dev-panel__input"
                placeholder="Search items..."
                @focus="showItemDropdown = true"
                @blur="handleSearchBlur"
              />
              <div v-if="showItemDropdown && !selectedItem && filteredItems.length > 0" class="dev-panel__dropdown">
                <div
                  v-for="item in filteredItems"
                  :key="item.itemId"
                  class="dev-panel__dropdown-item"
                  @mousedown="selectItem(item)"
                >
                  <span class="dev-panel__item-icon">
                    <img
                      v-if="item.icon && item.icon.startsWith('/')"
                      :src="item.icon"
                      alt=""
                      class="dev-panel__item-icon-img"
                    />
                    <span v-else>{{ item.icon || '📦' }}</span>
                  </span>
                  <span class="dev-panel__item-name" :style="{ color: getQualityColor(item.quality) }">{{ item.name }}</span>
                  <span class="dev-panel__item-category">{{ item.category }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Quantity -->
          <div class="dev-panel__field">
            <label class="dev-panel__label">Quantity</label>
            <div class="dev-panel__input-group">
              <input
                v-model.number="itemQuantity"
                type="number"
                class="dev-panel__input"
                min="1"
                max="9999"
              />
              <button class="dev-panel__btn dev-panel__btn--small" @click="itemQuantity = 10">10</button>
              <button class="dev-panel__btn dev-panel__btn--small" @click="itemQuantity = 100">100</button>
            </div>
          </div>

          <!-- Add Button -->
          <button
            class="dev-panel__btn dev-panel__btn--add"
            :disabled="!selectedItem || itemQuantity <= 0 || isAddingItem"
            @click="addItemToNode"
          >
            {{ isAddingItem ? 'Adding...' : 'Add to Node' }}
          </button>
        </div>

        <!-- Node Actions -->
        <div v-if="canClaimNode" class="dev-panel__section">
          <h4 class="dev-panel__section-title">Node Actions</h4>
          <p class="dev-panel__node-name">{{ selectedNodeName }}</p>
          <button class="dev-panel__btn dev-panel__btn--claim" @click="emit('claim-free')">
            Claim for Free
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dev-panel {
  position: relative;
}

.dev-panel__toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: rgba(30, 30, 40, 0.9);
  border: 1px solid rgba(100, 100, 120, 0.4);
  border-radius: 6px;
  color: #888;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dev-panel__toggle:hover {
  background: rgba(50, 50, 60, 0.95);
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.4);
}

.dev-panel__toggle--active {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.5);
}

.dev-panel__icon {
  width: 18px;
  height: 18px;
}

.dev-panel__content {
  position: absolute;
  top: 44px;
  left: 0;
  width: 260px;
  max-height: 80vh;
  overflow-y: auto;
  background: rgba(20, 20, 28, 0.98);
  border: 1px solid rgba(100, 100, 120, 0.3);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 100;
}

.dev-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: rgba(251, 191, 36, 0.1);
  border-bottom: 1px solid rgba(251, 191, 36, 0.2);
}

.dev-panel__title {
  font-size: 12px;
  font-weight: 600;
  color: #fbbf24;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.dev-panel__close {
  background: none;
  border: none;
  color: #888;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.dev-panel__close:hover {
  color: #fff;
}

.dev-panel__section {
  padding: 12px;
  border-bottom: 1px solid rgba(100, 100, 120, 0.2);
}

.dev-panel__section:last-child {
  border-bottom: none;
}

.dev-panel__section-title {
  margin: 0 0 10px 0;
  font-size: 10px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.dev-panel__field {
  margin-bottom: 8px;
}

.dev-panel__field:last-child {
  margin-bottom: 0;
}

.dev-panel__label {
  display: block;
  font-size: 11px;
  color: #999;
  margin-bottom: 4px;
}

.dev-panel__input-group {
  display: flex;
  gap: 4px;
}

.dev-panel__input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(100, 100, 120, 0.3);
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  font-family: inherit;
}

.dev-panel__input:focus {
  outline: none;
  border-color: rgba(251, 191, 36, 0.5);
}

.dev-panel__input::-webkit-inner-spin-button,
.dev-panel__input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.dev-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dev-panel__btn {
  padding: 6px 10px;
  background: rgba(100, 100, 120, 0.2);
  border: 1px solid rgba(100, 100, 120, 0.3);
  border-radius: 4px;
  color: #ccc;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.dev-panel__btn:hover:not(:disabled) {
  background: rgba(251, 191, 36, 0.2);
  border-color: rgba(251, 191, 36, 0.4);
  color: #fbbf24;
}

.dev-panel__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dev-panel__btn--small {
  padding: 4px 6px;
  font-size: 10px;
}

.dev-panel__btn--claim {
  width: 100%;
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.4);
  color: #4ade80;
}

.dev-panel__btn--claim:hover {
  background: rgba(34, 197, 94, 0.3);
  border-color: rgba(34, 197, 94, 0.6);
  color: #86efac;
}

.dev-panel__btn--add {
  width: 100%;
  margin-top: 8px;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.4);
  color: #60a5fa;
}

.dev-panel__btn--add:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.3);
  border-color: rgba(59, 130, 246, 0.6);
  color: #93c5fd;
}

.dev-panel__node-name {
  margin: 0 0 8px 0;
  font-size: 11px;
  color: #ccc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dev-panel__error {
  padding: 6px 8px;
  margin-bottom: 8px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 4px;
  color: #f87171;
  font-size: 11px;
}

.dev-panel__search-wrapper {
  position: relative;
}

.dev-panel__selected-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 4px;
  color: #60a5fa;
  font-size: 12px;
}

.dev-panel__clear-btn {
  background: none;
  border: none;
  color: #888;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  margin-left: 8px;
  line-height: 1;
}

.dev-panel__clear-btn:hover {
  color: #f87171;
}

.dev-panel__dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 200px;
  overflow-y: auto;
  background: rgba(30, 30, 40, 0.98);
  border: 1px solid rgba(100, 100, 120, 0.4);
  border-radius: 4px;
  margin-top: 2px;
  z-index: 200;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.dev-panel__dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  cursor: pointer;
  transition: background 0.1s;
}

.dev-panel__dropdown-item:hover {
  background: rgba(251, 191, 36, 0.15);
}

.dev-panel__item-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.dev-panel__item-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.dev-panel__item-name {
  flex: 1;
  font-size: 11px;
  color: #e5e5e5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dev-panel__item-category {
  font-size: 9px;
  color: #666;
  text-transform: uppercase;
}

/* Transition */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
