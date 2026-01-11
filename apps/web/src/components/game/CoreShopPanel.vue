<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import type { ItemStorage } from '@nova-fall/shared';
import { BLUEPRINT_QUALITY_COLORS, type BlueprintQuality } from '@nova-fall/shared';
import { nodesApi, type ShopItemDefinition } from '@/services/api';
import QuantityModal from './QuantityModal.vue';

const props = defineProps<{
  nodeId: string;
  storage: ItemStorage;
  playerCredits: number;
}>();

const emit = defineEmits<{
  (e: 'purchase', itemId: string, storage: ItemStorage, creditsRemaining: number): void;
}>();

const purchasing = ref<string | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);
const shopItems = ref<ShopItemDefinition[]>([]);
const selectedCategory = ref<string | null>(null);

// Modal state
const isModalOpen = ref(false);
const selectedItem = ref<ShopItemDefinition | null>(null);

// Get list of categories
const categories = computed(() => {
  const cats = new Set<string>();
  for (const item of shopItems.value) {
    cats.add(item.category);
  }
  return Array.from(cats).sort();
});

// Group items by category
const itemsByCategory = computed(() => {
  const grouped = new Map<string, ShopItemDefinition[]>();
  for (const item of shopItems.value) {
    if (!grouped.has(item.category)) {
      grouped.set(item.category, []);
    }
    grouped.get(item.category)!.push(item);
  }
  return grouped;
});

// Items for the currently selected category
const currentCategoryItems = computed(() => {
  if (!selectedCategory.value) return [];
  return itemsByCategory.value.get(selectedCategory.value) || [];
});

// Format category name for display
function formatCategory(category: string): string {
  return category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Get category icon
function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    NODE_CORE: '⚙️',
    UNIT: '🪖',
    BUILDING: '🏗️',
    RESOURCE: '📦',
    EQUIPMENT: '🛡️',
    CONSUMABLE: '🧪',
    CRAFTED: '🔨',
  };
  return icons[category] || '📦';
}

// Load shop items from database
async function loadShopItems() {
  loading.value = true;
  try {
    const response = await nodesApi.getShopItems();
    shopItems.value = response.data.items;
  } catch (err) {
    console.error('Failed to load shop items:', err);
    error.value = 'Failed to load shop items';
  } finally {
    loading.value = false;
  }
}

// Auto-select first category when items load
watch(categories, (cats) => {
  if (cats.length > 0 && !selectedCategory.value) {
    selectedCategory.value = cats[0] ?? null;
  }
}, { immediate: true });

onMounted(() => {
  loadShopItems();
});

// Get inventory count for an item
function getItemCount(itemId: string): number {
  return props.storage[itemId] ?? 0;
}

// Check if player can afford an item
function canAfford(item: ShopItemDefinition): boolean {
  return props.playerCredits >= item.hqCost;
}

// Open the quantity modal for an item
function openPurchaseModal(item: ShopItemDefinition) {
  if (purchasing.value) return;

  if (!canAfford(item)) {
    error.value = `Not enough credits. Need ${item.hqCost}`;
    setTimeout(() => error.value = null, 3000);
    return;
  }

  selectedItem.value = item;
  isModalOpen.value = true;
}

// Handle modal cancel
function handleModalCancel() {
  isModalOpen.value = false;
  selectedItem.value = null;
}

// Handle modal confirm - execute the purchase
async function handleModalConfirm(quantity: number) {
  const item = selectedItem.value;
  if (!item || purchasing.value) return;

  isModalOpen.value = false;
  purchasing.value = item.itemId;
  error.value = null;

  try {
    const response = await nodesApi.purchaseItem(props.nodeId, item.itemId, quantity);

    if (!response.data.success) {
      throw new Error('Failed to purchase item');
    }

    emit('purchase', item.itemId, response.data.storage as ItemStorage, response.data.creditsRemaining);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Purchase failed';
    setTimeout(() => error.value = null, 3000);
  } finally {
    purchasing.value = null;
    selectedItem.value = null;
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
  <div class="shop-panel">
    <div class="shop-header">
      <h4 class="shop-title">
        <span>🏬</span>
        <span>HQ Shop</span>
      </h4>
      <span class="shop-subtitle">Purchase items for your empire</span>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="shop-loading">
      <svg class="animate-spin h-6 w-6 text-yellow-400" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>

    <!-- Error Message (no items) -->
    <div v-else-if="error && shopItems.length === 0" class="shop-error">
      {{ error }}
    </div>

    <!-- No Items Available -->
    <div v-else-if="shopItems.length === 0" class="shop-empty">
      No items available. Configure items with HQ Cost in the Item Editor.
    </div>

    <!-- Shop Content with Tabs -->
    <template v-else>
      <!-- Error Message (when items exist) -->
      <div v-if="error" class="shop-error">
        {{ error }}
      </div>

      <!-- Category Tabs -->
      <div class="category-tabs">
        <button
          v-for="category in categories"
          :key="category"
          class="category-tab"
          :class="{ active: selectedCategory === category }"
          @click="selectedCategory = category"
        >
          <span class="tab-icon">{{ getCategoryIcon(category) }}</span>
          <span class="tab-label">{{ formatCategory(category) }}</span>
          <span class="tab-count">{{ itemsByCategory.get(category)?.length || 0 }}</span>
        </button>
      </div>

      <!-- Items List for Selected Category -->
      <div class="items-list">
        <div
          v-for="item in currentCategoryItems"
          :key="item.itemId"
          class="shop-item"
        >
          <div class="item-content">
            <!-- Item Icon -->
            <div
              class="item-icon"
              :style="{ backgroundColor: item.color + '20', color: item.color }"
            >
              <img
                v-if="isIconUrl(item.icon)"
                :src="item.icon!"
                :alt="item.name"
                class="icon-img"
              />
              <span v-else>{{ item.icon || '📦' }}</span>
            </div>

            <!-- Item Info -->
            <div class="item-info">
              <div class="item-name-row">
                <span class="item-name" :style="{ color: getQualityColor(item.quality) }">{{ item.name }}</span>
                <span
                  v-if="getItemCount(item.itemId) > 0"
                  class="item-stock"
                >
                  {{ getItemCount(item.itemId) }} in storage
                </span>
              </div>
              <p v-if="item.description" class="item-description">{{ item.description }}</p>
              <p v-if="item.targetNodeType" class="item-target">
                For: <span>{{ formatNodeType(item.targetNodeType) }}</span>
              </p>
            </div>

            <!-- Purchase Button -->
            <div class="item-purchase">
              <button
                :disabled="!canAfford(item) || purchasing === item.itemId"
                class="purchase-btn"
                :class="{ affordable: canAfford(item) }"
                @click="openPurchaseModal(item)"
              >
                <span v-if="purchasing === item.itemId" class="purchasing">
                  <svg class="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Buying...
                </span>
                <span v-else class="price">
                  <span>💰</span>
                  <span>{{ item.hqCost }}</span>
                </span>
              </button>
            </div>
          </div>
        </div>

        <!-- Empty Category -->
        <div v-if="currentCategoryItems.length === 0" class="category-empty">
          No items in this category
        </div>
      </div>
    </template>

    <!-- Quantity Modal -->
    <QuantityModal
      v-if="selectedItem"
      :is-open="isModalOpen"
      :item-name="selectedItem.name"
      :item-icon="selectedItem.icon"
      :item-color="selectedItem.color"
      :unit-price="selectedItem.hqCost"
      :player-credits="playerCredits"
      @confirm="handleModalConfirm"
      @cancel="handleModalCancel"
    />
  </div>
</template>

<style scoped>
.shop-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.shop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.shop-title {
  font-size: 14px;
  font-weight: 500;
  color: #facc15;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  gap: 8px;
}

.shop-subtitle {
  font-size: 12px;
  color: #9ca3af;
}

.shop-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 0;
}

.shop-error {
  background: rgba(127, 29, 29, 0.5);
  border: 1px solid rgba(239, 68, 68, 0.5);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  color: #fca5a5;
}

.shop-empty {
  text-align: center;
  padding: 32px 0;
  color: #9ca3af;
  font-size: 14px;
}

/* Category Tabs */
.category-tabs {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
}

.category-tabs::-webkit-scrollbar {
  height: 4px;
}

.category-tabs::-webkit-scrollbar-track {
  background: #1f2937;
  border-radius: 2px;
}

.category-tabs::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 2px;
}

.category-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 6px;
  color: #9ca3af;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}

.category-tab:hover {
  background: #374151;
  color: #e5e7eb;
}

.category-tab.active {
  background: #facc15;
  border-color: #facc15;
  color: #1f2937;
}

.tab-icon {
  font-size: 14px;
}

.tab-label {
  font-size: 12px;
}

.tab-count {
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
}

.category-tab.active .tab-count {
  background: rgba(0, 0, 0, 0.3);
}

/* Items List */
.items-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
  padding-right: 4px;
}

.items-list::-webkit-scrollbar {
  width: 6px;
}

.items-list::-webkit-scrollbar-track {
  background: #1f2937;
  border-radius: 3px;
}

.items-list::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 3px;
}

.shop-item {
  background: rgba(31, 41, 55, 0.5);
  border: 1px solid rgba(55, 65, 81, 0.5);
  border-radius: 8px;
  padding: 12px;
  transition: border-color 0.15s;
}

.shop-item:hover {
  border-color: rgba(75, 85, 99, 0.8);
}

.item-content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.item-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 20px;
  overflow: hidden;
  flex-shrink: 0;
}

.icon-img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.item-name {
  font-weight: 500;
}

.item-stock {
  padding: 2px 6px;
  font-size: 11px;
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
  border-radius: 4px;
}

.item-description {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 2px;
}

.item-target {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}

.item-target span {
  color: #d1d5db;
}

.item-purchase {
  flex-shrink: 0;
}

.purchase-btn {
  padding: 6px 12px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
  background: #374151;
  color: #9ca3af;
}

.purchase-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.purchase-btn.affordable {
  background: #ca8a04;
  color: white;
}

.purchase-btn.affordable:hover:not(:disabled) {
  background: #eab308;
}

.purchasing {
  display: flex;
  align-items: center;
  gap: 4px;
}

.price {
  display: flex;
  align-items: center;
  gap: 4px;
}

.category-empty {
  text-align: center;
  padding: 24px;
  color: #6b7280;
  font-size: 14px;
}
</style>
