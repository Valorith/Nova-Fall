<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import {
  itemsApi,
  uploadsApi,
  blueprintsApi,
  type ItemDefinitionListQuery,
  type Blueprint,
} from '@/services/api';
import IconPicker from './IconPicker.vue';
import {
  DbItemCategory,
  NodeType,
  BlueprintQuality,
  ITEM_CATEGORY_NAMES,
  ITEM_CATEGORY_COLORS,
  BLUEPRINT_QUALITY_NAMES,
  BLUEPRINT_QUALITY_COLORS,
  MIN_EFFICIENCY,
  MAX_EFFICIENCY,
  type DbItemDefinition,
  type UnitStats,
} from '@nova-fall/shared';

// State
const items = ref<DbItemDefinition[]>([]);
const allItemsCache = ref<DbItemDefinition[]>([]); // Cache for item lookups
const total = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);
const selectedItem = ref<DbItemDefinition | null>(null);
const isEditing = ref(false);
const isCreating = ref(false);
const saving = ref(false);

// Filters
const searchQuery = ref('');
const filterCategory = ref<DbItemCategory | ''>('');
const filterQuality = ref<BlueprintQuality | ''>('');
const filterTradeable = ref<'true' | 'false' | ''>('');

// Form state
const form = ref({
  itemId: '',
  name: '',
  description: '',
  category: DbItemCategory.RESOURCE,
  quality: BlueprintQuality.COMMON,
  icon: '',
  color: '#888888',
  stackSize: 1000,
  targetNodeType: null as NodeType | null,
  hqCost: null as number | null,
  efficiency: 1,
  isTradeable: false,
  buyPrice: null as number | null,
  sellPrice: null as number | null,
  productionRates: {} as Record<string, number>,
  linkedBlueprintId: null as string | null,
  unitStats: null as UnitStats | null,
});

// Default unit stats for new units/buildings
const defaultUnitStats: UnitStats = {
  health: 100,
  shield: 0,
  shieldRange: 0,
  damage: 10,
  armor: 5,
  speed: 2,
  range: 1,
  attackSpeed: 1.0,
};

// Blueprint selection state
const blueprints = ref<Blueprint[]>([]);
const blueprintSearchQuery = ref('');
const showBlueprintDropdown = ref(false);
const loadingBlueprints = ref(false);

// Selected item's linked blueprint (for view mode)
const selectedItemBlueprint = ref<Blueprint | null>(null);
const loadingSelectedBlueprint = ref(false);

// Icon upload state
const uploadingIcon = ref(false);
const iconUploadError = ref<string | null>(null);
const iconFileInput = ref<HTMLInputElement | null>(null);
const showIconPicker = ref(false);
const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Available options
const categories = Object.values(DbItemCategory);
const qualities = Object.values(BlueprintQuality);
const nodeTypes = Object.values(NodeType).filter(
  (t) => t !== NodeType.CAPITAL && t !== NodeType.CROWN
);
const efficiencyOptions = Array.from({ length: MAX_EFFICIENCY - MIN_EFFICIENCY + 1 }, (_, i) => i + MIN_EFFICIENCY);

// Production rate node types (nodes that can produce resources)
const productionNodeTypes = [
  NodeType.MINING,
  NodeType.POWER_PLANT,
  NodeType.REFINERY,
  NodeType.RESEARCH,
  NodeType.AGRICULTURAL,
  NodeType.TRADE_HUB,
  NodeType.CAPITAL,
  NodeType.BARRACKS,
  NodeType.MANUFACTURING_PLANT,
];

// Fetch all items for cache (used for lookups)
async function fetchAllItemsCache() {
  if (allItemsCache.value.length > 0) return; // Already fetched
  try {
    const response = await itemsApi.getAll({ limit: 1000 });
    allItemsCache.value = response.data.items;
  } catch (err) {
    console.error('Failed to load items cache:', err);
  }
}

// Fetch items (filtered for display)
async function fetchItems() {
  loading.value = true;
  error.value = null;
  try {
    const query: ItemDefinitionListQuery = {
      limit: 100,
      offset: 0,
    };
    if (searchQuery.value) query.search = searchQuery.value;
    if (filterCategory.value) query.category = filterCategory.value;
    if (filterQuality.value) query.quality = filterQuality.value;
    if (filterTradeable.value) query.isTradeable = filterTradeable.value === 'true';

    const response = await itemsApi.getAll(query);
    items.value = response.data.items;
    total.value = response.data.total;

    // Also update cache if no filters applied
    if (!searchQuery.value && !filterCategory.value && !filterQuality.value && !filterTradeable.value) {
      allItemsCache.value = response.data.items;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load items';
    console.error('Failed to load items:', err);
  } finally {
    loading.value = false;
  }
}

// Watch filters and search
watch([searchQuery, filterCategory, filterQuality, filterTradeable], fetchItems);

// Reset filters to default
function resetFilters() {
  searchQuery.value = '';
  filterCategory.value = '';
  filterQuality.value = '';
  filterTradeable.value = '';
}

// Select item for editing
function selectItem(item: DbItemDefinition) {
  selectedItem.value = item;
  isEditing.value = false;
  isCreating.value = false;
}

// Start editing
function startEdit() {
  if (!selectedItem.value) return;
  form.value = {
    itemId: selectedItem.value.itemId,
    name: selectedItem.value.name,
    description: selectedItem.value.description || '',
    category: selectedItem.value.category as DbItemCategory,
    quality: selectedItem.value.quality as BlueprintQuality,
    icon: selectedItem.value.icon || '',
    color: selectedItem.value.color,
    stackSize: selectedItem.value.stackSize,
    targetNodeType: selectedItem.value.targetNodeType,
    hqCost: selectedItem.value.hqCost,
    efficiency: selectedItem.value.efficiency,
    isTradeable: selectedItem.value.isTradeable,
    buyPrice: selectedItem.value.buyPrice,
    sellPrice: selectedItem.value.sellPrice,
    productionRates: selectedItem.value.productionRates || {},
    linkedBlueprintId: selectedItem.value.linkedBlueprintId,
    unitStats: selectedItem.value.unitStats || null,
  };
  // Fetch blueprints if this is a blueprint category item
  if (selectedItem.value.category === DbItemCategory.BLUEPRINT) {
    fetchBlueprints();
  }
  // Initialize unit stats if this is a unit or building
  if ((selectedItem.value.category === DbItemCategory.UNIT || selectedItem.value.category === DbItemCategory.BUILDING) && !form.value.unitStats) {
    form.value.unitStats = { ...defaultUnitStats };
  }
  isEditing.value = true;
  isCreating.value = false;
}

// Start creating new
function startCreate() {
  selectedItem.value = null;
  form.value = {
    itemId: '',
    name: '',
    description: '',
    category: DbItemCategory.RESOURCE,
    quality: BlueprintQuality.COMMON,
    icon: '',
    color: '#888888',
    stackSize: 1000,
    targetNodeType: null,
    hqCost: null,
    efficiency: 1,
    isTradeable: false,
    buyPrice: null,
    sellPrice: null,
    productionRates: {},
    linkedBlueprintId: null,
    unitStats: null,
  };
  isEditing.value = false;
  isCreating.value = true;
}

// Save item
async function save() {
  saving.value = true;
  error.value = null;
  try {
    // Clean up production rates (remove zeros)
    const cleanedProductionRates: Record<string, number> = {};
    for (const [nodeType, rate] of Object.entries(form.value.productionRates)) {
      if (rate && rate > 0) {
        cleanedProductionRates[nodeType] = rate;
      }
    }

    const data = {
      itemId: form.value.itemId,
      name: form.value.name,
      description: form.value.description || null,
      category: form.value.category,
      quality: form.value.quality,
      icon: form.value.icon || null,
      color: form.value.color,
      stackSize: form.value.stackSize,
      targetNodeType: form.value.category === DbItemCategory.NODE_CORE ? form.value.targetNodeType : null,
      hqCost: form.value.hqCost, // Available for all item types
      efficiency: form.value.category === DbItemCategory.NODE_CORE ? form.value.efficiency : 1,
      isTradeable: form.value.isTradeable,
      buyPrice: form.value.isTradeable ? form.value.buyPrice : null,
      sellPrice: form.value.isTradeable ? form.value.sellPrice : null,
      productionRates: Object.keys(cleanedProductionRates).length > 0 ? cleanedProductionRates : null,
      linkedBlueprintId: form.value.category === DbItemCategory.BLUEPRINT ? form.value.linkedBlueprintId : null,
      unitStats: (form.value.category === DbItemCategory.UNIT || form.value.category === DbItemCategory.BUILDING) ? form.value.unitStats : null,
    };

    if (isCreating.value) {
      const response = await itemsApi.create(data);
      selectedItem.value = response.data;
    } else if (selectedItem.value) {
      const response = await itemsApi.update(selectedItem.value.id, data);
      selectedItem.value = response.data;
    }

    isEditing.value = false;
    isCreating.value = false;
    await fetchItems();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save item';
    console.error('Failed to save item:', err);
  } finally {
    saving.value = false;
  }
}

// Delete item
async function deleteItem() {
  if (!selectedItem.value) return;
  if (!confirm(`Delete "${selectedItem.value.name}"?`)) return;

  saving.value = true;
  try {
    await itemsApi.delete(selectedItem.value.id);
    selectedItem.value = null;
    isEditing.value = false;
    await fetchItems();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete item';
  } finally {
    saving.value = false;
  }
}

// Duplicate item
async function duplicateItem() {
  if (!selectedItem.value) return;
  saving.value = true;
  try {
    const response = await itemsApi.duplicate(selectedItem.value.id);
    selectedItem.value = response.data;
    await fetchItems();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to duplicate item';
  } finally {
    saving.value = false;
  }
}

// Cancel editing
function cancel() {
  isEditing.value = false;
  isCreating.value = false;
  if (selectedItem.value) {
    selectItem(selectedItem.value);
  }
}

// Icon upload functions
function triggerIconUpload() {
  iconFileInput.value?.click();
}

async function handleIconUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (!allowedTypes.includes(file.type)) {
    iconUploadError.value = 'Invalid file type. Allowed: PNG, JPG, GIF, WebP, SVG';
    return;
  }

  if (file.size > 1024 * 1024) {
    iconUploadError.value = 'File too large. Maximum size: 1MB';
    return;
  }

  uploadingIcon.value = true;
  iconUploadError.value = null;

  try {
    const base64 = await fileToBase64(file);
    const response = await uploadsApi.uploadIcon({
      data: base64,
      filename: file.name,
    });
    form.value.icon = response.data.url;
  } catch (err) {
    iconUploadError.value = err instanceof Error ? err.message : 'Failed to upload icon';
  } finally {
    uploadingIcon.value = false;
    input.value = '';
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function clearIcon() {
  form.value.icon = '';
}

function getIconUrl(iconPath: string | null | undefined): string | null {
  if (!iconPath) return null;
  if (iconPath.startsWith('http://') || iconPath.startsWith('https://')) {
    return iconPath;
  }
  // Public folder icons (like /icons/items/...) are served directly
  if (iconPath.startsWith('/icons/')) {
    return iconPath;
  }
  // API uploaded icons need the API base URL
  return `${apiBaseUrl}${iconPath}`;
}

// Get category color (accepts string since DB stores as string)
function getCategoryColor(category: string): string {
  return ITEM_CATEGORY_COLORS[category as DbItemCategory] || '#888888';
}

// Get category name (accepts string since DB stores as string)
function getCategoryName(category: string): string {
  return ITEM_CATEGORY_NAMES[category as DbItemCategory] || category;
}

// Get quality color (accepts string since DB stores as string)
function getQualityColor(quality: string): string {
  return BLUEPRINT_QUALITY_COLORS[quality as BlueprintQuality] || '#888888';
}

// Get quality name (accepts string since DB stores as string)
function getQualityName(quality: string): string {
  return BLUEPRINT_QUALITY_NAMES[quality as BlueprintQuality] || quality;
}

// Computed for showing node core fields
const showNodeCoreFields = computed(() => form.value.category === DbItemCategory.NODE_CORE);
const showTradeFields = computed(() => form.value.isTradeable);
const showBlueprintFields = computed(() => form.value.category === DbItemCategory.BLUEPRINT);
const showUnitFields = computed(() =>
  form.value.category === DbItemCategory.UNIT || form.value.category === DbItemCategory.BUILDING
);

// Filtered blueprints for dropdown
const filteredBlueprints = computed(() => {
  const query = blueprintSearchQuery.value.toLowerCase();
  if (!query) return blueprints.value;
  return blueprints.value.filter(
    (bp) => bp.name.toLowerCase().includes(query) || bp.id.includes(query)
  );
});

// Get linked blueprint info
const linkedBlueprint = computed(() => {
  if (!form.value.linkedBlueprintId) return null;
  return blueprints.value.find((bp) => bp.id === form.value.linkedBlueprintId);
});

// Fetch blueprints for selection
async function fetchBlueprints() {
  if (blueprints.value.length > 0) return; // Already fetched
  loadingBlueprints.value = true;
  try {
    const response = await blueprintsApi.getAll({ limit: 500 });
    blueprints.value = response.data.blueprints;
  } catch (err) {
    console.error('Failed to load blueprints:', err);
  } finally {
    loadingBlueprints.value = false;
  }
}

// Select a blueprint
function selectBlueprint(blueprint: Blueprint) {
  form.value.linkedBlueprintId = blueprint.id;
  showBlueprintDropdown.value = false;
  blueprintSearchQuery.value = '';
}

// Clear linked blueprint
function clearLinkedBlueprint() {
  form.value.linkedBlueprintId = null;
}

// Watch category to fetch blueprints when BLUEPRINT category selected
// and initialize unit stats when UNIT category selected
watch(() => form.value.category, (category) => {
  if (category === DbItemCategory.BLUEPRINT) {
    fetchBlueprints();
  }
  if ((category === DbItemCategory.UNIT || category === DbItemCategory.BUILDING) && !form.value.unitStats) {
    form.value.unitStats = { ...defaultUnitStats };
  }
});

// Fetch linked blueprint for selected item (view mode)
async function fetchSelectedItemBlueprint() {
  if (!selectedItem.value?.linkedBlueprintId) {
    selectedItemBlueprint.value = null;
    return;
  }

  loadingSelectedBlueprint.value = true;
  try {
    const response = await blueprintsApi.getById(selectedItem.value.linkedBlueprintId);
    selectedItemBlueprint.value = response.data;
  } catch (err) {
    console.error('Failed to load linked blueprint:', err);
    selectedItemBlueprint.value = null;
  } finally {
    loadingSelectedBlueprint.value = false;
  }
}

// Watch selected item to fetch linked blueprint when viewing BLUEPRINT items
watch(selectedItem, (item) => {
  if (item?.category === DbItemCategory.BLUEPRINT && item.linkedBlueprintId) {
    fetchSelectedItemBlueprint();
  } else {
    selectedItemBlueprint.value = null;
  }
});

// Get output item info from cache (falls back to filtered list)
function getOutputItemInfo(itemId: string): DbItemDefinition | undefined {
  return allItemsCache.value.find((item) => item.itemId === itemId)
    || items.value.find((item) => item.itemId === itemId);
}

// Initialize
onMounted(() => {
  fetchItems();
  fetchAllItemsCache();
});
</script>

<template>
  <div class="items-editor">
    <!-- Header -->
    <div class="editor-header">
      <h2>Items Editor</h2>
      <div class="header-actions">
        <button class="btn btn-primary" @click="startCreate">
          + New Item
        </button>
      </div>
    </div>

    <!-- Error display -->
    <div v-if="error" class="error-banner">
      {{ error }}
      <button @click="error = null">&times;</button>
    </div>

    <div class="editor-content">
      <!-- Left panel: List with filters -->
      <div class="list-panel">
        <!-- Filters -->
        <div class="filters">
          <div class="filter-row">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search items..."
              class="search-input"
            />
            <button
              type="button"
              class="btn-reset"
              title="Reset filters"
              @click="resetFilters"
            >
              Reset
            </button>
          </div>
          <select v-model="filterCategory" class="filter-select">
            <option value="">All Categories</option>
            <option v-for="cat in categories" :key="cat" :value="cat">
              {{ ITEM_CATEGORY_NAMES[cat] }}
            </option>
          </select>
          <select
            v-model="filterQuality"
            class="filter-select quality-filter"
            :style="filterQuality ? { borderColor: getQualityColor(filterQuality), borderWidth: '2px' } : {}"
          >
            <option value="">All Qualities</option>
            <option v-for="q in qualities" :key="q" :value="q">
              {{ BLUEPRINT_QUALITY_NAMES[q] }}
            </option>
          </select>
          <select v-model="filterTradeable" class="filter-select">
            <option value="">All Items</option>
            <option value="true">Tradeable Only</option>
            <option value="false">Non-Tradeable Only</option>
          </select>
        </div>

        <!-- Item list -->
        <div class="item-list">
          <div v-if="loading" class="loading">Loading...</div>
          <div v-else-if="items.length === 0" class="empty">
            No items found
          </div>
          <div
            v-for="item in items"
            :key="item.id"
            class="item-row"
            :class="{ selected: selectedItem?.id === item.id }"
            @click="selectItem(item)"
          >
            <div class="item-header">
              <span class="item-icon">
                <img
                  v-if="item.icon && item.icon.startsWith('/')"
                  :src="getIconUrl(item.icon) || ''"
                  alt=""
                  class="item-icon-img"
                />
                <span v-else :style="{ color: item.color }">{{ item.icon || '📦' }}</span>
              </span>
              <span class="item-name" :style="{ color: getQualityColor(item.quality) }">{{ item.name }}</span>
              <span v-if="item.category === 'BLUEPRINT'" class="blueprint-badge">BP</span>
              <span v-if="item.isTradeable" class="tradeable-badge">Trade</span>
              <span v-if="item.hqCost && item.hqCost > 0" class="hq-badge">HQ</span>
            </div>
            <div class="item-meta">
              <span
                class="category-badge"
                :style="{ backgroundColor: getCategoryColor(item.category) }"
              >
                {{ getCategoryName(item.category) }}
              </span>
              <span
                class="quality-badge"
                :style="{ color: getQualityColor(item.quality) }"
              >
                {{ getQualityName(item.quality) }}
              </span>
            </div>
          </div>
        </div>

        <div class="list-footer">
          <span>{{ total }} items</span>
        </div>
      </div>

      <!-- Right panel: Detail/Edit form -->
      <div class="detail-panel">
        <!-- No selection -->
        <div v-if="!selectedItem && !isCreating" class="no-selection">
          <p>Select an item to view details or create a new one</p>
        </div>

        <!-- View mode -->
        <div v-else-if="selectedItem && !isEditing && !isCreating" class="detail-view">
          <div class="detail-header">
            <div class="detail-header-left">
              <div v-if="selectedItem.icon" class="detail-icon" :style="{ borderColor: getQualityColor(selectedItem.quality) }">
                <template v-if="selectedItem.icon.startsWith('/')">
                  <img :src="getIconUrl(selectedItem.icon) || ''" alt="" class="detail-icon-img" />
                </template>
                <span v-else class="detail-icon-emoji">{{ selectedItem.icon }}</span>
              </div>
              <div>
                <h3 :style="{ color: getQualityColor(selectedItem.quality) }">{{ selectedItem.name }}</h3>
                <code class="item-id">{{ selectedItem.itemId }}</code>
              </div>
            </div>
            <span
              class="category-badge large"
              :style="{ backgroundColor: getCategoryColor(selectedItem.category) }"
            >
              {{ getCategoryName(selectedItem.category) }}
            </span>
          </div>

          <div class="detail-body">
            <div class="detail-row">
              <label>Quality</label>
              <span
                class="quality-display"
                :style="{ color: getQualityColor(selectedItem.quality), borderColor: getQualityColor(selectedItem.quality) }"
              >
                {{ getQualityName(selectedItem.quality) }}
              </span>
            </div>
            <div class="detail-row">
              <label>Stack Size</label>
              <span>{{ selectedItem.stackSize === 0 ? 'Unlimited' : selectedItem.stackSize }}</span>
            </div>
            <div v-if="selectedItem.description" class="detail-row">
              <label>Description</label>
              <p class="description">{{ selectedItem.description }}</p>
            </div>

            <!-- HQ Cost (shown for any item with hqCost set) -->
            <div v-if="selectedItem.hqCost" class="detail-row">
              <label>HQ Cost</label>
              <span>{{ selectedItem.hqCost }} Credits</span>
            </div>

            <!-- Node Core specific -->
            <template v-if="selectedItem.category === 'NODE_CORE'">
              <div class="detail-row">
                <label>Target Node</label>
                <span>{{ selectedItem.targetNodeType?.replace(/_/g, ' ') || 'None' }}</span>
              </div>
              <div class="detail-row">
                <label>Efficiency</label>
                <span class="efficiency-value" :class="'efficiency-' + selectedItem.efficiency">
                  {{ selectedItem.efficiency }}
                  <span v-if="selectedItem.efficiency > 1" class="efficiency-bonus">
                    (+{{ (selectedItem.efficiency - 1) * 10 }}% bonus)
                  </span>
                </span>
              </div>
            </template>

            <!-- Blueprint output info -->
            <template v-if="selectedItem.category === 'BLUEPRINT'">
              <div class="detail-row">
                <label>Linked Blueprint</label>
                <span v-if="loadingSelectedBlueprint" class="loading-text">Loading...</span>
                <span v-else-if="selectedItemBlueprint" :style="{ color: getQualityColor(selectedItemBlueprint.quality) }">
                  {{ selectedItemBlueprint.name }}
                </span>
                <span v-else class="no-link">No linked blueprint</span>
              </div>
              <div v-if="selectedItemBlueprint && selectedItemBlueprint.outputs.length > 0" class="detail-row">
                <label>Produces</label>
                <div class="output-items">
                  <div
                    v-for="output in selectedItemBlueprint.outputs"
                    :key="output.itemId"
                    class="output-item"
                  >
                    <span class="output-icon">
                      <img
                        v-if="getOutputItemInfo(output.itemId)?.icon?.startsWith('/')"
                        :src="getIconUrl(getOutputItemInfo(output.itemId)?.icon) || ''"
                        alt=""
                        class="output-icon-img"
                      />
                      <span v-else>{{ getOutputItemInfo(output.itemId)?.icon || '📦' }}</span>
                    </span>
                    <span class="output-name" :style="{ color: getQualityColor(getOutputItemInfo(output.itemId)?.quality || 'COMMON') }">
                      {{ getOutputItemInfo(output.itemId)?.name || output.itemId }}
                    </span>
                    <span class="output-qty">x{{ output.quantity }}</span>
                  </div>
                </div>
              </div>
            </template>

            <!-- Unit/Building Stats display -->
            <template v-if="selectedItem.category === 'UNIT' || selectedItem.category === 'BUILDING'">
              <div class="detail-section-header">{{ selectedItem.category === 'UNIT' ? 'Unit' : 'Building' }} Combat Stats</div>
              <div v-if="selectedItem.unitStats" class="unit-stats-display">
                <div class="stat-item">
                  <span class="stat-label">Health</span>
                  <span class="stat-value health">{{ selectedItem.unitStats.health }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Shield</span>
                  <span class="stat-value shield">{{ selectedItem.unitStats.shield }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Shield Range</span>
                  <span class="stat-value" :class="{ 'aoe-shield': selectedItem.unitStats.shieldRange > 0 }">
                    {{ selectedItem.unitStats.shieldRange > 0 ? selectedItem.unitStats.shieldRange + ' tiles (AOE)' : 'Personal' }}
                  </span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Damage</span>
                  <span class="stat-value damage">{{ selectedItem.unitStats.damage }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Armor</span>
                  <span class="stat-value armor">{{ selectedItem.unitStats.armor }}</span>
                </div>
                <div v-if="selectedItem.category === 'UNIT'" class="stat-item">
                  <span class="stat-label">Speed</span>
                  <span class="stat-value">{{ selectedItem.unitStats.speed }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Range</span>
                  <span class="stat-value">{{ selectedItem.unitStats.range }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Attack Speed</span>
                  <span class="stat-value">{{ selectedItem.unitStats.attackSpeed }}/s</span>
                </div>
              </div>
              <div v-else class="stats-not-set">
                <span class="not-set-message">Stats not configured. Click Edit to set combat stats.</span>
              </div>
            </template>

            <!-- Trade info -->
            <div class="detail-row">
              <label>Tradeable</label>
              <span>{{ selectedItem.isTradeable ? 'Yes' : 'No' }}</span>
            </div>
            <template v-if="selectedItem.isTradeable">
              <div class="detail-row">
                <label>Buy Price</label>
                <span>{{ selectedItem.buyPrice }} Credits</span>
              </div>
              <div class="detail-row">
                <label>Sell Price</label>
                <span>{{ selectedItem.sellPrice }} Credits</span>
              </div>
            </template>

            <!-- Production rates -->
            <div v-if="selectedItem.productionRates && Object.keys(selectedItem.productionRates).length > 0" class="detail-row">
              <label>Production Rates (per hour)</label>
              <div class="production-rates">
                <div
                  v-for="(rate, nodeType) in selectedItem.productionRates"
                  :key="nodeType"
                  class="production-rate"
                >
                  <span class="node-type">{{ String(nodeType).replace(/_/g, ' ') }}</span>
                  <span class="rate">{{ rate }}/hr</span>
                </div>
              </div>
            </div>
          </div>

          <div class="detail-actions">
            <button class="btn btn-primary" @click="startEdit">Edit</button>
            <button class="btn btn-secondary" :disabled="saving" @click="duplicateItem">
              Duplicate
            </button>
            <button class="btn btn-danger" :disabled="saving" @click="deleteItem">
              Delete
            </button>
          </div>
        </div>

        <!-- Edit/Create mode -->
        <div v-else class="edit-form">
          <div class="form-header">
            <h3>{{ isCreating ? 'New Item' : 'Edit Item' }}</h3>
          </div>

          <div class="form-body">
            <!-- Basic info -->
            <div class="form-row">
              <div class="form-group">
                <label>Item ID *</label>
                <input
                  v-model="form.itemId"
                  type="text"
                  placeholder="unique_item_id"
                  class="form-input"
                  :disabled="!isCreating"
                />
                <span class="hint">Unique identifier (cannot be changed after creation)</span>
              </div>
              <div class="form-group">
                <label>Name *</label>
                <input v-model="form.name" type="text" placeholder="Item Name" class="form-input" />
              </div>
            </div>

            <div class="form-group">
              <label>Description</label>
              <textarea v-model="form.description" placeholder="Optional description" rows="2" class="form-input"></textarea>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Category *</label>
                <select v-model="form.category" class="form-input">
                  <option v-for="cat in categories" :key="cat" :value="cat">
                    {{ ITEM_CATEGORY_NAMES[cat] }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label>Quality</label>
                <select
                  v-model="form.quality"
                  class="form-input quality-select"
                  :style="{ borderColor: getQualityColor(form.quality) }"
                >
                  <option v-for="q in qualities" :key="q" :value="q">
                    {{ BLUEPRINT_QUALITY_NAMES[q] }}
                  </option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label>Stack Size</label>
              <input v-model.number="form.stackSize" type="number" min="0" class="form-input" />
              <span class="hint">0 = unlimited</span>
            </div>

            <div class="form-group">
              <label>Color</label>
              <div class="color-input-wrapper">
                <input v-model="form.color" type="color" class="color-picker" />
                <input v-model="form.color" type="text" placeholder="#888888" class="form-input color-text" />
              </div>
            </div>

            <!-- Icon Upload -->
            <div class="form-group">
              <label>Icon</label>
              <div class="icon-upload-section">
                <div v-if="form.icon" class="icon-preview">
                  <template v-if="form.icon.startsWith('/')">
                    <img :src="getIconUrl(form.icon) || ''" alt="Item icon" class="preview-image" />
                  </template>
                  <span v-else class="preview-emoji">{{ form.icon }}</span>
                  <button type="button" class="btn-clear-icon" title="Remove icon" @click="clearIcon">
                    &times;
                  </button>
                </div>
                <div v-else class="icon-placeholder">
                  <span class="placeholder-text">No icon</span>
                </div>

                <div class="icon-upload-controls">
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    @click="showIconPicker = true"
                  >
                    Browse Icons
                  </button>
                  <input
                    ref="iconFileInput"
                    type="file"
                    accept=".png,.jpg,.jpeg,.gif,.webp,.svg"
                    class="hidden-file-input"
                    @change="handleIconUpload"
                  />
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="uploadingIcon"
                    @click="triggerIconUpload"
                  >
                    {{ uploadingIcon ? 'Uploading...' : 'Upload Custom' }}
                  </button>
                  <span class="upload-hint">or emoji:</span>
                  <input
                    v-model="form.icon"
                    type="text"
                    placeholder="📦"
                    class="emoji-input"
                  />
                </div>

                <div v-if="iconUploadError" class="icon-upload-error">
                  {{ iconUploadError }}
                </div>
              </div>
            </div>

            <!-- HQ Shop Settings (available for all items) -->
            <div class="section-header">HQ Shop Settings</div>
            <div class="form-group">
              <label>HQ Cost (Credits)</label>
              <input v-model.number="form.hqCost" type="number" min="0" class="form-input" placeholder="Leave empty if not purchasable at HQ" />
              <span class="hint">If set, this item can be purchased at the player's HQ for this many credits</span>
            </div>

            <!-- Node Core specific fields -->
            <template v-if="showNodeCoreFields">
              <div class="section-header">Node Core Settings</div>
              <div class="form-row">
                <div class="form-group">
                  <label>Target Node Type *</label>
                  <select v-model="form.targetNodeType" class="form-input">
                    <option :value="null">Select...</option>
                    <option v-for="nt in nodeTypes" :key="nt" :value="nt">
                      {{ nt.replace(/_/g, ' ') }}
                    </option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Efficiency</label>
                  <select v-model.number="form.efficiency" class="form-input efficiency-select">
                    <option v-for="e in efficiencyOptions" :key="e" :value="e">
                      {{ e }} {{ e > 1 ? `(+${(e - 1) * 10}% bonus)` : '(Base)' }}
                    </option>
                  </select>
                  <span class="hint">Bonus per point above 1: +10% production/speed, -10% trade fee</span>
                </div>
              </div>
            </template>

            <!-- Unit/Building Stats fields -->
            <template v-if="showUnitFields && form.unitStats">
              <div class="section-header">{{ form.category === DbItemCategory.UNIT ? 'Unit' : 'Building' }} Combat Stats</div>
              <p class="section-hint">Configure stats for this {{ form.category === DbItemCategory.UNIT ? 'unit' : 'building' }} when it enters combat</p>
              <div class="unit-stats-grid">
                <div class="form-group">
                  <label>Health</label>
                  <input v-model.number="form.unitStats.health" type="number" min="1" class="form-input" />
                  <span class="hint">Hit points before death</span>
                </div>
                <div class="form-group">
                  <label>Shield</label>
                  <input v-model.number="form.unitStats.shield" type="number" min="0" class="form-input" />
                  <span class="hint">Shield HP (absorbs damage first)</span>
                </div>
                <div class="form-group">
                  <label>Shield Range</label>
                  <input v-model.number="form.unitStats.shieldRange" type="number" min="0" step="0.1" class="form-input" />
                  <span class="hint">0 = personal shield, &gt;0 = AOE radius protecting allies</span>
                </div>
                <div class="form-group">
                  <label>Damage</label>
                  <input v-model.number="form.unitStats.damage" type="number" min="0" class="form-input" />
                  <span class="hint">Damage per attack</span>
                </div>
                <div class="form-group">
                  <label>Armor</label>
                  <input v-model.number="form.unitStats.armor" type="number" min="0" class="form-input" />
                  <span class="hint">Damage reduction</span>
                </div>
                <div v-if="form.category === DbItemCategory.UNIT" class="form-group">
                  <label>Speed</label>
                  <input v-model.number="form.unitStats.speed" type="number" min="0" step="0.1" class="form-input" />
                  <span class="hint">Movement speed (tiles/min)</span>
                </div>
                <div class="form-group">
                  <label>Range</label>
                  <input v-model.number="form.unitStats.range" type="number" min="0" step="0.1" class="form-input" />
                  <span class="hint">Attack range in tiles</span>
                </div>
                <div class="form-group">
                  <label>Attack Speed</label>
                  <input v-model.number="form.unitStats.attackSpeed" type="number" min="0.1" step="0.1" class="form-input" />
                  <span class="hint">Attacks per second</span>
                </div>
              </div>
            </template>

            <!-- Flags -->
            <div class="section-header">Item Flags</div>

            <!-- Blueprint selector (shown when category is BLUEPRINT) -->
            <template v-if="showBlueprintFields">
              <div class="form-group">
                <label>Linked Blueprint</label>
                <div class="blueprint-selector">
                  <div v-if="linkedBlueprint" class="linked-blueprint">
                    <span class="blueprint-name" :style="{ color: BLUEPRINT_QUALITY_COLORS[linkedBlueprint.quality] }">
                      {{ linkedBlueprint.name }}
                    </span>
                    <button type="button" class="btn-clear" @click="clearLinkedBlueprint">&times;</button>
                  </div>
                  <div v-else class="blueprint-search-wrapper">
                    <input
                      v-model="blueprintSearchQuery"
                      type="text"
                      placeholder="Search blueprints..."
                      class="form-input"
                      @focus="showBlueprintDropdown = true"
                    />
                    <div v-if="showBlueprintDropdown && filteredBlueprints.length > 0" class="blueprint-dropdown">
                      <div
                        v-for="bp in filteredBlueprints"
                        :key="bp.id"
                        class="blueprint-option"
                        @click="selectBlueprint(bp)"
                      >
                        <span :style="{ color: BLUEPRINT_QUALITY_COLORS[bp.quality] }">{{ bp.name }}</span>
                        <span class="blueprint-category">{{ bp.category }}</span>
                      </div>
                    </div>
                    <div v-if="loadingBlueprints" class="loading-blueprints">Loading...</div>
                  </div>
                </div>
                <span class="hint">Select the blueprint this item represents</span>
              </div>
            </template>

            <div class="form-group checkbox-group">
              <label class="checkbox-label">
                <input v-model="form.isTradeable" type="checkbox" />
                <span>Item can be bought/sold at Trade Hubs</span>
              </label>
            </div>

            <template v-if="showTradeFields">
              <div class="form-row">
                <div class="form-group">
                  <label>Buy Price (Credits)</label>
                  <input v-model.number="form.buyPrice" type="number" min="0" class="form-input" />
                  <span class="hint">Price player pays to buy</span>
                </div>
                <div class="form-group">
                  <label>Sell Price (Credits)</label>
                  <input v-model.number="form.sellPrice" type="number" min="0" class="form-input" />
                  <span class="hint">Price player receives when selling</span>
                </div>
              </div>
            </template>

            <!-- Production rates -->
            <div class="section-header">Production Rates (per hour)</div>
            <p class="section-hint">Set hourly production rates for nodes that produce this resource</p>
            <div class="production-grid">
              <div v-for="nodeType in productionNodeTypes" :key="nodeType" class="production-input">
                <label>{{ nodeType.replace(/_/g, ' ') }}</label>
                <input
                  v-model.number="form.productionRates[nodeType]"
                  type="number"
                  min="0"
                  placeholder="0"
                  class="form-input"
                />
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button class="btn btn-primary" :disabled="saving" @click="save">
              {{ saving ? 'Saving...' : (isCreating ? 'Create' : 'Save') }}
            </button>
            <button class="btn btn-secondary" :disabled="saving" @click="cancel">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Icon Picker Modal -->
    <IconPicker
      v-model="form.icon"
      v-model:show="showIconPicker"
    />
  </div>
</template>

<style scoped>
.items-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f1419;
  color: #e5e5e5;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a3040;
}

.editor-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.error-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: rgba(239, 68, 68, 0.15);
  border-bottom: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.error-banner button {
  background: none;
  border: none;
  color: #f87171;
  font-size: 18px;
  cursor: pointer;
}

.editor-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* List Panel */
.list-panel {
  width: 360px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #2a3040;
  background: #151a24;
}

.filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a3040;
}

.filter-row {
  display: flex;
  gap: 8px;
}

.filter-row .search-input {
  flex: 1;
}

.btn-reset {
  padding: 8px 12px;
  background: #374151;
  border: 1px solid #4b5563;
  border-radius: 6px;
  color: #9ca3af;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.btn-reset:hover {
  background: #4b5563;
  color: #e5e5e5;
}

.search-input,
.filter-select {
  width: 100%;
  padding: 8px 12px;
  background: #0a0d12;
  border: 1px solid #2a3040;
  border-radius: 6px;
  color: #e5e5e5;
  font-size: 14px;
}

.search-input:focus,
.filter-select:focus {
  outline: none;
  border-color: #3b82f6;
}

.item-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.loading,
.empty {
  padding: 24px;
  text-align: center;
  color: #6b7280;
}

.item-row {
  padding: 12px;
  margin-bottom: 4px;
  background: #1a1f2e;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.item-row:hover {
  background: #232938;
}

.item-row.selected {
  background: #2a3550;
  border: 1px solid #3b82f6;
}

.item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.item-icon {
  font-size: 20px;
  width: 28px;
  height: 28px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.item-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.item-name {
  flex: 1;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.blueprint-badge {
  font-size: 9px;
  padding: 2px 6px;
  background: rgba(168, 85, 247, 0.2);
  color: #a855f7;
  border-radius: 4px;
  text-transform: uppercase;
  font-weight: 600;
}

.tradeable-badge {
  font-size: 9px;
  padding: 2px 6px;
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
  border-radius: 4px;
  text-transform: uppercase;
}

.hq-badge {
  font-size: 9px;
  padding: 2px 6px;
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
  border-radius: 4px;
  text-transform: uppercase;
  font-weight: 600;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.category-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  color: #000;
  font-weight: 600;
}

.category-badge.large {
  font-size: 12px;
  padding: 4px 10px;
}

.quality-badge {
  font-size: 11px;
  font-weight: 600;
}

.quality-display {
  font-weight: 600;
  padding: 4px 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid;
  border-radius: 4px;
  display: inline-block;
}

.quality-select {
  border-width: 2px;
}

.list-footer {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: #6b7280;
  border-top: 1px solid #2a3040;
}

/* Detail Panel */
.detail-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.no-selection {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
}

.detail-view,
.edit-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-header,
.form-header {
  padding: 16px 20px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a3040;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-header h3,
.form-header h3 {
  margin: 0;
  font-size: 18px;
}

.detail-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.detail-icon {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f1419;
  border: 2px solid;
  border-radius: 8px;
  overflow: hidden;
}

.detail-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.detail-icon-emoji {
  font-size: 32px;
}

.item-id {
  font-size: 12px;
  color: #6b7280;
  background: #0f1419;
  padding: 2px 6px;
  border-radius: 4px;
}

.detail-body,
.form-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.detail-row {
  margin-bottom: 16px;
}

.detail-row label {
  display: block;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
  text-transform: uppercase;
}

.detail-row span,
.detail-row p {
  font-size: 14px;
}

.description {
  margin: 0;
  color: #9ca3af;
}

.production-rates {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.production-rate {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #1a1f2e;
  border-radius: 6px;
  font-size: 13px;
}

.production-rate .node-type {
  color: #9ca3af;
}

.production-rate .rate {
  color: #22c55e;
  font-weight: 600;
}

.detail-actions,
.form-actions {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  background: #1a1f2e;
  border-top: 1px solid #2a3040;
}

/* Form styles */
.form-group {
  margin-bottom: 16px;
}

.form-group > label {
  display: block;
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 6px;
  text-transform: uppercase;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  background: #0a0d12;
  border: 1px solid #2a3040;
  border-radius: 6px;
  color: #e5e5e5;
  font-size: 14px;
}

.form-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.form-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-input::placeholder {
  color: #4b5563;
}

.form-group .hint {
  display: block;
  font-size: 11px;
  color: #6b7280;
  margin-top: 4px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.section-header {
  font-size: 14px;
  font-weight: 600;
  color: #9ca3af;
  margin: 24px 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #2a3040;
}

.section-hint {
  font-size: 12px;
  color: #6b7280;
  margin: 0 0 12px 0;
}

.checkbox-group {
  margin-bottom: 16px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  text-transform: none;
  font-size: 14px;
  color: #e5e5e5;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: #3b82f6;
}

.color-input-wrapper {
  display: flex;
  gap: 8px;
  align-items: center;
}

.color-picker {
  width: 48px;
  height: 40px;
  padding: 0;
  border: 1px solid #2a3040;
  border-radius: 6px;
  cursor: pointer;
}

.color-text {
  flex: 1;
}

.production-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.production-input {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.production-input label {
  font-size: 11px;
  color: #6b7280;
  text-transform: uppercase;
}

.production-input .form-input {
  padding: 8px 10px;
}

/* Icon upload styles */
.icon-upload-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.icon-preview {
  position: relative;
  display: inline-flex;
  width: 64px;
  height: 64px;
  background: #1a1f2e;
  border: 2px solid #3b82f6;
  border-radius: 8px;
  overflow: hidden;
  align-items: center;
  justify-content: center;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.preview-emoji {
  font-size: 32px;
}

.btn-clear-icon {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.9);
  border: none;
  border-radius: 4px;
  color: white;
  font-size: 14px;
  cursor: pointer;
}

.icon-placeholder {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1f2e;
  border: 2px dashed #2a3040;
  border-radius: 8px;
}

.placeholder-text {
  font-size: 11px;
  color: #6b7280;
}

.icon-upload-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hidden-file-input {
  display: none;
}

.upload-hint {
  font-size: 12px;
  color: #6b7280;
}

.emoji-input {
  width: 60px;
  padding: 8px 10px;
  background: #0a0d12;
  border: 1px solid #2a3040;
  border-radius: 6px;
  color: #e5e5e5;
  font-size: 16px;
  text-align: center;
}

.icon-upload-error {
  font-size: 12px;
  color: #f87171;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 4px;
}

/* Buttons */
.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-secondary {
  background: #374151;
  color: #e5e5e5;
}

.btn-secondary:hover:not(:disabled) {
  background: #4b5563;
}

.btn-danger {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.btn-danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.25);
}

/* Blueprint selector styles */
.blueprint-selector {
  position: relative;
}

.linked-blueprint {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #0a0d12;
  border: 1px solid #3b82f6;
  border-radius: 6px;
}

.blueprint-name {
  font-weight: 600;
  flex: 1;
}

.btn-clear {
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.btn-clear:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.blueprint-search-wrapper {
  position: relative;
}

.blueprint-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 200px;
  overflow-y: auto;
  background: #1a1f2e;
  border: 1px solid #2a3040;
  border-radius: 6px;
  margin-top: 4px;
  z-index: 100;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
}

.blueprint-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.blueprint-option:hover {
  background: #232938;
}

.blueprint-category {
  font-size: 11px;
  color: #6b7280;
  text-transform: uppercase;
}

.loading-blueprints {
  padding: 12px;
  text-align: center;
  color: #6b7280;
  font-size: 13px;
}

/* Efficiency styles */
.efficiency-value {
  font-weight: 600;
}

.efficiency-bonus {
  color: #22c55e;
  font-size: 12px;
  margin-left: 4px;
}

.efficiency-1 { color: #9ca3af; }
.efficiency-2 { color: #22c55e; }
.efficiency-3 { color: #3b82f6; }
.efficiency-4 { color: #a855f7; }
.efficiency-5 { color: #f59e0b; }

.efficiency-select {
  min-width: 180px;
}

/* Blueprint output display */
.loading-text {
  color: #6b7280;
  font-style: italic;
}

.no-link {
  color: #6b7280;
  font-style: italic;
}

.output-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.output-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #1a1f2e;
  border-radius: 8px;
  border: 1px solid #2a3040;
}

.output-icon {
  font-size: 24px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.output-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.output-name {
  flex: 1;
  font-weight: 500;
  font-size: 14px;
}

.output-qty {
  font-size: 13px;
  color: #9ca3af;
  font-weight: 600;
}

/* Unit Stats styles */
.unit-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.unit-stats-grid .form-group {
  margin-bottom: 8px;
}

.unit-stats-grid .form-input {
  padding: 8px 10px;
}

.detail-section-header {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  margin: 20px 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #2a3040;
}

.unit-stats-display {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: #1a1f2e;
  border-radius: 8px;
  border: 1px solid #2a3040;
}

.stat-label {
  font-size: 11px;
  color: #6b7280;
  text-transform: uppercase;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: #e5e5e5;
}

.stat-value.health {
  color: #22c55e;
}

.stat-value.shield {
  color: #3b82f6;
}

.stat-value.aoe-shield {
  color: #a855f7;
}

.stats-not-set {
  padding: 12px;
  background: rgba(107, 114, 128, 0.1);
  border: 1px dashed #4b5563;
  border-radius: 6px;
  margin-top: 8px;
}

.not-set-message {
  color: #9ca3af;
  font-size: 13px;
  font-style: italic;
}

.stat-value.damage {
  color: #ef4444;
}

.stat-value.armor {
  color: #f59e0b;
}
</style>
