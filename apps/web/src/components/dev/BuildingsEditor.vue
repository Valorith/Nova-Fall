<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { buildingsApi, itemsApi, type BuildingDefinitionListQuery } from '@/services/api';
import type { DbBuildingDefinition, BuildingCategory, DbItemDefinition, BlueprintQuality } from '@nova-fall/shared';
import { BLUEPRINT_QUALITY_COLORS } from '@nova-fall/shared';
import ModelPreview from './ModelPreview.vue';
import ModelSelectorModal from './ModelSelectorModal.vue';

// Ref for click-outside detection
const linkItemSectionRef = ref<HTMLElement | null>(null);

// State
const buildings = ref<DbBuildingDefinition[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);
const selectedBuilding = ref<DbBuildingDefinition | null>(null);
const isEditing = ref(false);
const isCreating = ref(false);
const saving = ref(false);

// Item linking state
const availableItems = ref<DbItemDefinition[]>([]);
const loadingItems = ref(false);
const showItemDropdown = ref(false);
const itemSearchQuery = ref('');
const linkingItem = ref(false);
const selectedItemIds = ref<Set<string>>(new Set());

// Get quality color for an item
function getQualityColor(quality: BlueprintQuality): string {
  return BLUEPRINT_QUALITY_COLORS[quality] || '#FFFFFF';
}

// Toggle item selection
function toggleItemSelection(itemId: string) {
  if (selectedItemIds.value.has(itemId)) {
    selectedItemIds.value.delete(itemId);
  } else {
    selectedItemIds.value.add(itemId);
  }
  selectedItemIds.value = new Set(selectedItemIds.value);
}

// Check if item is selected
function isItemSelected(itemId: string): boolean {
  return selectedItemIds.value.has(itemId);
}

// Select all filtered items
function selectAllItems() {
  for (const item of filteredItems.value) {
    selectedItemIds.value.add(item.id);
  }
  selectedItemIds.value = new Set(selectedItemIds.value);
}

// Clear selection
function clearSelection() {
  selectedItemIds.value = new Set();
}

// Close the item dropdown
function closeItemDropdown() {
  showItemDropdown.value = false;
  itemSearchQuery.value = '';
  clearSelection();
}

// Handle click outside to close dropdown and auto-save selections
async function handleClickOutside(event: MouseEvent) {
  if (linkItemSectionRef.value && !linkItemSectionRef.value.contains(event.target as Node)) {
    // Auto-save if there are selected items
    if (selectedItemIds.value.size > 0) {
      await linkSelectedItems();
    } else {
      closeItemDropdown();
    }
  }
}

// Add/remove click outside listener when dropdown opens/closes
watch(showItemDropdown, (isOpen) => {
  if (isOpen) {
    setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
  } else {
    document.removeEventListener('click', handleClickOutside);
  }
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

// Model selector state
const showModelSelector = ref(false);

// Filters
const searchQuery = ref('');
const filterCategory = ref<BuildingCategory | ''>('');

// Form state
const form = ref({
  name: '',
  description: '',
  modelPath: '',
  width: 1,
  height: 1,
  health: 200,
  shield: 0,
  armor: 10,
  damage: 0,
  range: 0,
  attackSpeed: 0,
  category: 'structure' as BuildingCategory,
});

// Available categories
const categories: BuildingCategory[] = ['turret', 'wall', 'structure', 'utility'];

const categoryNames: Record<BuildingCategory, string> = {
  turret: 'Turret',
  wall: 'Wall',
  structure: 'Structure',
  utility: 'Utility',
};

const categoryColors: Record<BuildingCategory, string> = {
  turret: '#ef4444',
  wall: '#6b7280',
  structure: '#3b82f6',
  utility: '#22c55e',
};

// Fetch buildings
async function fetchBuildings() {
  loading.value = true;
  error.value = null;
  try {
    const query: BuildingDefinitionListQuery = {
      limit: 100,
      offset: 0,
    };
    if (searchQuery.value) query.search = searchQuery.value;
    if (filterCategory.value) query.category = filterCategory.value;

    const response = await buildingsApi.getAll(query);
    buildings.value = response.data.buildings;
    total.value = response.data.total;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load buildings';
    console.error('Failed to load buildings:', err);
  } finally {
    loading.value = false;
  }
}

// Watch filters
watch([searchQuery, filterCategory], fetchBuildings);

// Reset filters
function resetFilters() {
  searchQuery.value = '';
  filterCategory.value = '';
}

// Select building
function selectBuilding(building: DbBuildingDefinition) {
  selectedBuilding.value = building;
  isEditing.value = false;
  isCreating.value = false;
}

// Start editing
function startEdit() {
  if (!selectedBuilding.value) return;
  form.value = {
    name: selectedBuilding.value.name,
    description: selectedBuilding.value.description || '',
    modelPath: selectedBuilding.value.modelPath || '',
    width: selectedBuilding.value.width,
    height: selectedBuilding.value.height,
    health: selectedBuilding.value.health,
    shield: selectedBuilding.value.shield,
    armor: selectedBuilding.value.armor,
    damage: selectedBuilding.value.damage,
    range: selectedBuilding.value.range,
    attackSpeed: selectedBuilding.value.attackSpeed,
    category: selectedBuilding.value.category as BuildingCategory,
  };
  isEditing.value = true;
  isCreating.value = false;
}

// Start creating
function startCreate() {
  selectedBuilding.value = null;
  form.value = {
    name: '',
    description: '',
    modelPath: '',
    width: 1,
    height: 1,
    health: 200,
    shield: 0,
    armor: 10,
    damage: 0,
    range: 0,
    attackSpeed: 0,
    category: 'structure',
  };
  isEditing.value = false;
  isCreating.value = true;
}

// Save
async function save() {
  saving.value = true;
  error.value = null;
  try {
    const data = {
      name: form.value.name,
      description: form.value.description || null,
      modelPath: form.value.modelPath || null,
      width: form.value.width,
      height: form.value.height,
      health: form.value.health,
      shield: form.value.shield,
      armor: form.value.armor,
      damage: form.value.damage,
      range: form.value.range,
      attackSpeed: form.value.attackSpeed,
      category: form.value.category,
    };

    if (isCreating.value) {
      const response = await buildingsApi.create(data);
      selectedBuilding.value = response.data;
    } else if (selectedBuilding.value) {
      const response = await buildingsApi.update(selectedBuilding.value.id, data);
      selectedBuilding.value = response.data;
    }

    isEditing.value = false;
    isCreating.value = false;
    await fetchBuildings();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save building';
    console.error('Failed to save building:', err);
  } finally {
    saving.value = false;
  }
}

// Delete
async function deleteBuilding() {
  if (!selectedBuilding.value) return;
  if (!confirm(`Delete "${selectedBuilding.value.name}"?`)) return;

  saving.value = true;
  try {
    await buildingsApi.delete(selectedBuilding.value.id);
    selectedBuilding.value = null;
    isEditing.value = false;
    await fetchBuildings();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete building';
  } finally {
    saving.value = false;
  }
}

// Duplicate
async function duplicateBuilding() {
  if (!selectedBuilding.value) return;
  saving.value = true;
  try {
    const response = await buildingsApi.duplicate(selectedBuilding.value.id);
    selectedBuilding.value = response.data;
    await fetchBuildings();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to duplicate building';
  } finally {
    saving.value = false;
  }
}

// Cancel
function cancel() {
  isEditing.value = false;
  isCreating.value = false;
  if (selectedBuilding.value) {
    selectBuilding(selectedBuilding.value);
  }
}

// Linked items count
const linkedItemsCount = computed(() => {
  if (!selectedBuilding.value?.items) return 0;
  return selectedBuilding.value.items.length;
});

// Check if building has combat capability
const hasCombat = computed(() => {
  if (!selectedBuilding.value) return false;
  return selectedBuilding.value.damage > 0;
});

// Fetch all items that are not yet linked to any definition
async function fetchAvailableItems() {
  loadingItems.value = true;
  try {
    const response = await itemsApi.getAll({ limit: 500 });
    // Filter out items that are already linked to a unit or building
    availableItems.value = response.data.items.filter(
      (item: DbItemDefinition) => !item.buildingDefinitionId && !item.unitDefinitionId
    );
  } catch (err) {
    console.error('Failed to load items:', err);
  } finally {
    loadingItems.value = false;
  }
}

// Filtered items for dropdown
const filteredItems = computed(() => {
  const query = itemSearchQuery.value.toLowerCase();
  if (!query) return availableItems.value;
  return availableItems.value.filter(
    (item) => item.name.toLowerCase().includes(query) || item.itemId.toLowerCase().includes(query)
  );
});

// Link selected items to this building
async function linkSelectedItems() {
  if (!selectedBuilding.value || selectedItemIds.value.size === 0) return;
  linkingItem.value = true;
  try {
    // Link all selected items
    const promises = Array.from(selectedItemIds.value).map((itemId) =>
      itemsApi.update(itemId, { buildingDefinitionId: selectedBuilding.value!.id })
    );
    await Promise.all(promises);
    // Refresh the building to get updated items list
    const response = await buildingsApi.getById(selectedBuilding.value.id);
    selectedBuilding.value = response.data;
    // Refresh available items and clear selection
    await fetchAvailableItems();
    selectedItemIds.value = new Set();
    showItemDropdown.value = false;
    itemSearchQuery.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to link items';
  } finally {
    linkingItem.value = false;
  }
}

// Unlink an item from this building
async function unlinkItem(itemId: string) {
  if (!selectedBuilding.value) return;
  linkingItem.value = true;
  try {
    await itemsApi.update(itemId, { buildingDefinitionId: null });
    // Refresh the building to get updated items list
    const response = await buildingsApi.getById(selectedBuilding.value.id);
    selectedBuilding.value = response.data;
    // Refresh available items
    await fetchAvailableItems();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to unlink item';
  } finally {
    linkingItem.value = false;
  }
}

// Fetch available items when a building is selected
watch(selectedBuilding, (building) => {
  if (building && !isCreating.value) {
    fetchAvailableItems();
  }
});

// Handle model selection from modal
function handleModelSelect(path: string) {
  form.value.modelPath = path;
  showModelSelector.value = false;
}

onMounted(fetchBuildings);
</script>

<template>
  <div class="buildings-editor">
    <!-- Header -->
    <div class="editor-header">
      <h2>Buildings Editor</h2>
      <div class="header-actions">
        <button class="btn btn-primary" @click="startCreate">
          + New Building
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
              placeholder="Search buildings..."
              class="search-input"
            />
            <button type="button" class="btn-reset" @click="resetFilters">Reset</button>
          </div>
          <select v-model="filterCategory" class="filter-select">
            <option value="">All Categories</option>
            <option v-for="cat in categories" :key="cat" :value="cat">
              {{ categoryNames[cat] }}
            </option>
          </select>
        </div>

        <!-- Building list -->
        <div class="building-list">
          <div v-if="loading" class="loading">Loading...</div>
          <div v-else-if="buildings.length === 0" class="empty">No buildings found</div>
          <div
            v-for="building in buildings"
            :key="building.id"
            class="building-row"
            :class="{ selected: selectedBuilding?.id === building.id }"
            @click="selectBuilding(building)"
          >
            <div class="building-header">
              <span class="building-name">{{ building.name }}</span>
              <span
                v-if="building.items && building.items.length > 0"
                class="linked-badge"
                :title="`Linked to ${building.items.length} item(s)`"
              >
                {{ building.items.length }}
              </span>
            </div>
            <div class="building-meta">
              <span
                class="category-badge"
                :style="{ backgroundColor: categoryColors[building.category as BuildingCategory] }"
              >
                {{ categoryNames[building.category as BuildingCategory] }}
              </span>
              <span class="stat-preview">
                {{ building.width }}x{{ building.height }} | HP: {{ building.health }}
              </span>
            </div>
          </div>
        </div>

        <div class="list-footer">
          <span>{{ total }} buildings</span>
        </div>
      </div>

      <!-- Right panel: Detail/Edit form -->
      <div class="detail-panel">
        <!-- No selection -->
        <div v-if="!selectedBuilding && !isCreating" class="no-selection">
          <p>Select a building to view details or create a new one</p>
        </div>

        <!-- View mode -->
        <div v-else-if="selectedBuilding && !isEditing && !isCreating" class="detail-view">
          <div class="detail-header">
            <div>
              <h3>{{ selectedBuilding.name }}</h3>
              <p v-if="selectedBuilding.description" class="building-description">
                {{ selectedBuilding.description }}
              </p>
            </div>
            <span
              class="category-badge large"
              :style="{ backgroundColor: categoryColors[selectedBuilding.category as BuildingCategory] }"
            >
              {{ categoryNames[selectedBuilding.category as BuildingCategory] }}
            </span>
          </div>

          <div class="detail-body">
            <!-- Linked Items (at top for visibility) -->
            <div class="linked-items-section top-section">
              <div class="section-header-with-action">
                <span>Linked Items ({{ linkedItemsCount }})</span>
                <button
                  v-if="!showItemDropdown"
                  type="button"
                  class="btn-link-item"
                  @click="showItemDropdown = true"
                >
                  + Link Item
                </button>
              </div>

              <!-- Currently linked items -->
              <div v-if="linkedItemsCount > 0" class="linked-items-grid">
                <div
                  v-for="item in selectedBuilding.items"
                  :key="item.id"
                  class="linked-item-card"
                  :style="{ borderColor: getQualityColor(item.quality) + '40' }"
                >
                  <button
                    type="button"
                    class="btn-unlink-card"
                    title="Unlink this item"
                    :disabled="linkingItem"
                    @click="unlinkItem(item.id)"
                  >
                    &times;
                  </button>
                  <span
                    class="linked-item-name"
                    :style="{ color: getQualityColor(item.quality) }"
                  >{{ item.name }}</span>
                  <span class="linked-item-quality" :style="{ color: getQualityColor(item.quality) }">
                    {{ item.quality }}
                  </span>
                </div>
              </div>
              <div v-else-if="!showItemDropdown" class="no-linked-items">
                No items linked to this building. Click "+ Link Item" to add one.
              </div>

              <!-- Link new item dropdown -->
              <div v-if="showItemDropdown" ref="linkItemSectionRef" class="link-item-section">
                <!-- Selected items indicator -->
                <div v-if="selectedItemIds.size > 0" class="selected-items-indicator">
                  {{ selectedItemIds.size }} item{{ selectedItemIds.size !== 1 ? 's' : '' }} selected
                </div>
                <div class="link-item-wrapper">
                  <div class="link-item-header">
                    <input
                      v-model="itemSearchQuery"
                      type="text"
                      placeholder="Search items to link..."
                      class="link-item-input"
                    />
                    <div class="selection-actions">
                      <button type="button" class="btn-select-action" @click="selectAllItems">All</button>
                      <button type="button" class="btn-select-action" @click="clearSelection">None</button>
                    </div>
                  </div>
                  <div v-if="!loadingItems" class="link-item-dropdown">
                    <div v-if="filteredItems.length === 0" class="dropdown-empty">
                      No unlinked items available. Create an item first.
                    </div>
                    <div
                      v-for="item in filteredItems"
                      :key="item.id"
                      class="dropdown-item"
                      :class="{ selected: isItemSelected(item.id) }"
                      @click="toggleItemSelection(item.id)"
                    >
                      <input
                        type="checkbox"
                        :checked="isItemSelected(item.id)"
                        class="item-checkbox"
                        @click.stop
                        @change="toggleItemSelection(item.id)"
                      />
                      <span
                        class="dropdown-item-name"
                        :style="{ color: getQualityColor(item.quality) }"
                      >{{ item.name }}</span>
                      <span class="dropdown-item-quality" :style="{ color: getQualityColor(item.quality) }">
                        {{ item.quality }}
                      </span>
                      <span class="dropdown-item-id">{{ item.itemId }}</span>
                    </div>
                  </div>
                  <div v-if="loadingItems" class="loading-items">Loading items...</div>
                </div>
                <div class="link-item-actions">
                  <button
                    type="button"
                    class="btn-link-selected"
                    :disabled="selectedItemIds.size === 0 || linkingItem"
                    @click="linkSelectedItems"
                  >
                    {{ linkingItem ? 'Linking...' : `Link ${selectedItemIds.size} Item${selectedItemIds.size !== 1 ? 's' : ''}` }}
                  </button>
                  <button
                    type="button"
                    class="btn-cancel-link"
                    @click="closeItemDropdown"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>

            <!-- Size -->
            <div class="detail-row">
              <label>Size (tiles)</label>
              <span class="size-display">{{ selectedBuilding.width }} x {{ selectedBuilding.height }}</span>
            </div>

            <!-- Model Preview -->
            <div class="model-preview-section">
              <label>3D Model Preview</label>
              <ModelPreview :model-path="selectedBuilding.modelPath" :height="200" />
              <span v-if="selectedBuilding.modelPath" class="model-path-hint">{{ selectedBuilding.modelPath }}</span>
            </div>

            <!-- Defense Stats -->
            <div class="section-header">Defense Stats</div>
            <div class="stats-grid defense-stats">
              <div class="stat-item">
                <span class="stat-label">Health</span>
                <span class="stat-value health">{{ selectedBuilding.health }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Shield</span>
                <span class="stat-value shield">{{ selectedBuilding.shield }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Armor</span>
                <span class="stat-value armor">{{ selectedBuilding.armor }}</span>
              </div>
            </div>

            <!-- Combat Stats (if applicable) -->
            <template v-if="hasCombat">
              <div class="section-header">Combat Stats</div>
              <div class="stats-grid combat-stats">
                <div class="stat-item">
                  <span class="stat-label">Damage</span>
                  <span class="stat-value damage">{{ selectedBuilding.damage }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Range</span>
                  <span class="stat-value">{{ selectedBuilding.range }} tiles</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Attack Speed</span>
                  <span class="stat-value">{{ selectedBuilding.attackSpeed }}/s</span>
                </div>
              </div>
            </template>
            <div v-else class="no-combat">
              <span class="no-combat-text">Non-combat building</span>
            </div>
          </div>

          <div class="detail-actions">
            <button class="btn btn-primary" @click="startEdit">Edit</button>
            <button class="btn btn-secondary" :disabled="saving" @click="duplicateBuilding">
              Duplicate
            </button>
            <button
              class="btn btn-danger"
              :disabled="saving || linkedItemsCount > 0"
              :title="linkedItemsCount > 0 ? 'Cannot delete - items are linked to this building' : ''"
              @click="deleteBuilding"
            >
              Delete
            </button>
          </div>
        </div>

        <!-- Edit/Create mode -->
        <div v-else class="edit-form">
          <div class="form-header">
            <h3>{{ isCreating ? 'New Building' : 'Edit Building' }}</h3>
          </div>

          <div class="form-body">
            <!-- Basic info -->
            <div class="form-group">
              <label>Name *</label>
              <input v-model="form.name" type="text" placeholder="Building Name" class="form-input" />
            </div>

            <div class="form-group">
              <label>Description</label>
              <textarea v-model="form.description" placeholder="Optional description" rows="2" class="form-input"></textarea>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Category</label>
                <select v-model="form.category" class="form-input">
                  <option v-for="cat in categories" :key="cat" :value="cat">
                    {{ categoryNames[cat] }}
                  </option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Width (tiles)</label>
                <input v-model.number="form.width" type="number" min="1" class="form-input" />
              </div>
              <div class="form-group">
                <label>Height (tiles)</label>
                <input v-model.number="form.height" type="number" min="1" class="form-input" />
              </div>
            </div>

            <div class="form-group">
              <label>Model Path</label>
              <div class="model-path-input">
                <input v-model="form.modelPath" type="text" placeholder="/models/buildings/example.glb" class="form-input" />
                <button type="button" class="btn-browse" @click="showModelSelector = true">
                  Browse...
                </button>
              </div>
              <span class="hint">Path to 3D model (relative to /public). Use #MeshName for pack files.</span>
            </div>

            <!-- Model Preview (live update) -->
            <div class="model-preview-section">
              <label>Model Preview</label>
              <ModelPreview :model-path="form.modelPath || null" :height="180" />
            </div>

            <!-- Defense Stats -->
            <div class="section-header">Defense Stats</div>
            <div class="stats-form-grid-3">
              <div class="form-group">
                <label>Health</label>
                <input v-model.number="form.health" type="number" min="1" class="form-input" />
              </div>
              <div class="form-group">
                <label>Shield</label>
                <input v-model.number="form.shield" type="number" min="0" class="form-input" />
              </div>
              <div class="form-group">
                <label>Armor</label>
                <input v-model.number="form.armor" type="number" min="0" class="form-input" />
              </div>
            </div>

            <!-- Combat Stats -->
            <div class="section-header">Combat Stats (optional)</div>
            <p class="section-hint">Set damage &gt; 0 to make this a combat building (like a turret)</p>
            <div class="stats-form-grid-3">
              <div class="form-group">
                <label>Damage</label>
                <input v-model.number="form.damage" type="number" min="0" class="form-input" />
              </div>
              <div class="form-group">
                <label>Range (tiles)</label>
                <input v-model.number="form.range" type="number" min="0" step="0.1" class="form-input" />
              </div>
              <div class="form-group">
                <label>Attack Speed (/s)</label>
                <input v-model.number="form.attackSpeed" type="number" min="0" step="0.1" class="form-input" />
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button class="btn btn-primary" :disabled="saving || !form.name" @click="save">
              {{ saving ? 'Saving...' : (isCreating ? 'Create' : 'Save') }}
            </button>
            <button class="btn btn-secondary" :disabled="saving" @click="cancel">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Model Selector Modal -->
    <ModelSelectorModal
      :visible="showModelSelector"
      category="buildings"
      :current-path="form.modelPath"
      @close="showModelSelector = false"
      @select="handleModelSelect"
    />
  </div>
</template>

<style scoped>
.buildings-editor {
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

.building-list {
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

.building-row {
  padding: 12px;
  margin-bottom: 4px;
  background: #1a1f2e;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.building-row:hover {
  background: #232938;
}

.building-row.selected {
  background: #2a3550;
  border: 1px solid #3b82f6;
}

.building-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.building-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.linked-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
  border-radius: 4px;
  font-weight: 600;
}

.building-meta {
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

.stat-preview {
  font-size: 11px;
  color: #6b7280;
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
  align-items: flex-start;
}

.detail-header h3,
.form-header h3 {
  margin: 0;
  font-size: 18px;
}

.building-description {
  margin: 4px 0 0 0;
  font-size: 13px;
  color: #9ca3af;
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

.size-display {
  font-size: 16px;
  font-weight: 600;
  color: #e5e5e5;
}

.model-path {
  font-family: monospace;
  font-size: 13px;
  padding: 6px 10px;
  background: #1a1f2e;
  border-radius: 4px;
  display: inline-block;
}

.no-value {
  color: #6b7280;
  font-style: italic;
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

.stats-grid {
  display: grid;
  gap: 12px;
  margin-bottom: 16px;
}

.defense-stats {
  grid-template-columns: repeat(3, 1fr);
}

.combat-stats {
  grid-template-columns: repeat(3, 1fr);
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

.stat-value.health { color: #22c55e; }
.stat-value.shield { color: #3b82f6; }
.stat-value.armor { color: #f59e0b; }
.stat-value.damage { color: #ef4444; }

.no-combat {
  padding: 12px;
  background: rgba(107, 114, 128, 0.1);
  border: 1px dashed #4b5563;
  border-radius: 6px;
  text-align: center;
}

.no-combat-text {
  color: #6b7280;
  font-size: 13px;
}

.linked-items-section {
  margin-top: 24px;
}

.linked-items-section:first-child,
.linked-items-section.top-section {
  margin-top: 0;
}

.linked-items-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.linked-item-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 16px 10px;
  background: #1a1f2e;
  border: 1px solid #2a3040;
  border-radius: 8px;
  min-width: 80px;
  max-width: 120px;
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

.model-path-input {
  display: flex;
  gap: 8px;
}

.model-path-input .form-input {
  flex: 1;
}

.btn-browse {
  padding: 10px 16px;
  background: #374151;
  border: 1px solid #4b5563;
  border-radius: 6px;
  color: #e5e5e5;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.btn-browse:hover {
  background: #4b5563;
  border-color: #6b7280;
}

.hint {
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

.stats-form-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.stats-form-grid-3 .form-group {
  margin-bottom: 8px;
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

/* Model Preview */
.model-preview-section {
  margin-bottom: 20px;
}

.model-preview-section > label {
  display: block;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.model-path-hint {
  display: block;
  font-size: 11px;
  color: #6b7280;
  margin-top: 6px;
  font-family: monospace;
}

/* Item linking styles */
.linked-item-card .linked-item-name {
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  word-break: break-word;
  line-height: 1.3;
}

.linked-item-card .linked-item-quality {
  font-size: 9px;
  text-transform: uppercase;
  font-weight: 600;
  opacity: 0.7;
}

.btn-unlink-card {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.15);
  border: none;
  border-radius: 3px;
  color: #f87171;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  opacity: 0;
}

.linked-item-card:hover .btn-unlink-card {
  opacity: 1;
}

.btn-unlink-card:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.4);
}

.btn-unlink-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.no-linked-items {
  padding: 12px;
  color: #6b7280;
  font-size: 13px;
  font-style: italic;
  text-align: center;
  background: #1a1f2e;
  border-radius: 6px;
  border: 1px dashed #2a3040;
}

.link-item-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.link-item-wrapper {
  flex: 1;
  position: relative;
}

.link-item-input {
  width: 100%;
  padding: 10px 12px;
  background: #0a0d12;
  border: 1px solid #2a3040;
  border-radius: 6px;
  color: #e5e5e5;
  font-size: 13px;
}

.link-item-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.link-item-dropdown {
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

.dropdown-empty {
  padding: 12px;
  text-align: center;
  color: #6b7280;
  font-size: 13px;
  font-style: italic;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid #2a3040;
}

.dropdown-item:last-child {
  border-bottom: none;
}

.dropdown-item:hover {
  background: #232938;
}

.dropdown-item-name {
  flex: 1;
  font-weight: 500;
}

.dropdown-item-quality {
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 600;
  opacity: 0.8;
}

.dropdown-item-id {
  color: #6b7280;
  font-family: monospace;
  font-size: 11px;
}

.dropdown-item.selected {
  background: rgba(59, 130, 246, 0.15);
}

.item-checkbox {
  width: 16px;
  height: 16px;
  accent-color: #3b82f6;
  cursor: pointer;
}

.link-item-header {
  display: flex;
  gap: 8px;
  align-items: center;
}

.link-item-header .link-item-input {
  flex: 1;
}

.selection-actions {
  display: flex;
  gap: 4px;
}

.btn-select-action {
  padding: 6px 10px;
  background: #374151;
  border: 1px solid #4b5563;
  border-radius: 4px;
  color: #9ca3af;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-select-action:hover {
  background: #4b5563;
  color: #e5e5e5;
}

.link-item-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.btn-link-selected {
  flex: 1;
  padding: 10px 16px;
  background: #3b82f6;
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-link-selected:hover:not(:disabled) {
  background: #2563eb;
}

.btn-link-selected:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.linked-item-quality {
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 600;
  opacity: 0.8;
}

.selected-items-indicator {
  padding: 8px 12px;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 6px;
  color: #3b82f6;
  font-size: 13px;
  font-weight: 500;
  text-align: center;
}

.loading-items {
  padding: 12px;
  text-align: center;
  color: #6b7280;
  font-size: 13px;
}

.btn-cancel-link {
  padding: 10px 16px;
  background: #374151;
  border: none;
  border-radius: 6px;
  color: #9ca3af;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-cancel-link:hover {
  background: #4b5563;
  color: #e5e5e5;
}

.section-header-with-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: #9ca3af;
  margin: 24px 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #2a3040;
}

.btn-link-item {
  padding: 6px 12px;
  background: #3b82f6;
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-link-item:hover {
  background: #2563eb;
}
</style>
