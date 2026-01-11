<script setup lang="ts">
/**
 * CombatDevPanel - Dev tool for testing units and buildings in combat
 *
 * Allows selecting units/buildings from the database and placing them
 * on the 3D arena for testing purposes.
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { unitsApi, buildingsApi } from '@/services/api';
import { useCombatEngine } from '@/composables/useCombatEngine';
import type { DbUnitDefinition, DbBuildingDefinition } from '@nova-fall/shared';

defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
  placementModeChange: [active: boolean];
}>();

// Get combat engine methods
const {
  engine,
  initDevArena,
  hasArena,
  screenToArena,
  devSpawnUnit,
  devPlaceBuilding,
  devClearAll,
  getDevEntityCount,
} = useCombatEngine();

// State
const units = ref<DbUnitDefinition[]>([]);
const buildings = ref<DbBuildingDefinition[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

// Selection state
const selectedTeam = ref<'attacker' | 'defender'>('attacker');
const selectedItem = ref<{
  type: 'unit' | 'building';
  item: DbUnitDefinition | DbBuildingDefinition;
} | null>(null);
const placementMode = ref(false);

// Panel visibility
const isCollapsed = ref(false);

// Entity counts (reactive)
const entityCounts = ref({ units: 0, buildings: 0 });

// Category colors
const unitCategoryColors: Record<string, string> = {
  infantry: '#22c55e',
  combat_vehicle: '#3b82f6',
  support_vehicle: '#a855f7',
};

const buildingCategoryColors: Record<string, string> = {
  turret: '#ef4444',
  wall: '#6b7280',
  structure: '#3b82f6',
  utility: '#22c55e',
};

// Load units and buildings from API
async function loadData() {
  loading.value = true;
  error.value = null;

  try {
    const [unitsRes, buildingsRes] = await Promise.all([
      unitsApi.getAll({ limit: 100 }),
      buildingsApi.getAll({ limit: 100 }),
    ]);
    units.value = unitsRes.data.units;
    buildings.value = buildingsRes.data.buildings;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load data';
    console.error('Failed to load units/buildings:', err);
  } finally {
    loading.value = false;
  }
}

// Select an item for placement
function selectItem(type: 'unit' | 'building', item: DbUnitDefinition | DbBuildingDefinition) {
  if (selectedItem.value?.item === item) {
    // Deselect if clicking same item
    selectedItem.value = null;
    placementMode.value = false;
    emit('placementModeChange', false);
  } else {
    selectedItem.value = { type, item };
    placementMode.value = true;
    emit('placementModeChange', true);
  }
}

// Handle click on arena for placement
function handleArenaClick(event: MouseEvent) {
  if (!placementMode.value || !selectedItem.value) return;

  const position = screenToArena(event.clientX, event.clientY);
  if (!position) return;

  if (selectedItem.value.type === 'unit') {
    devSpawnUnit(selectedItem.value.item as DbUnitDefinition, position, selectedTeam.value);
  } else {
    devPlaceBuilding(selectedItem.value.item as DbBuildingDefinition, position, selectedTeam.value);
  }

  // Update entity counts
  updateEntityCounts();
}

// Cancel placement mode
function cancelPlacement() {
  selectedItem.value = null;
  placementMode.value = false;
  emit('placementModeChange', false);
}

// Clear all dev entities
function handleClearAll() {
  devClearAll();
  updateEntityCounts();
}

// Update entity counts
function updateEntityCounts() {
  entityCounts.value = getDevEntityCount();
}

// Handle escape key
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && placementMode.value) {
    cancelPlacement();
  }
}

// Expose click handler for parent to wire up
defineExpose({
  handleArenaClick,
});

// Watch for engine to be ready, then initialize dev arena
watch(
  engine,
  (newEngine) => {
    if (newEngine && !hasArena()) {
      initDevArena();
    }
  },
  { immediate: true }
);

onMounted(() => {
  loadData();
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});

// Computed
const totalEntities = computed(() => entityCounts.value.units + entityCounts.value.buildings);
</script>

<template>
  <div v-if="visible" class="combat-dev-panel" :class="{ collapsed: isCollapsed }">
    <!-- Header -->
    <div class="panel-header">
      <div class="header-title">
        <span class="dev-badge">DEV</span>
        <span>Combat Tools</span>
      </div>
      <div class="header-actions">
        <button type="button" class="btn-collapse" @click="isCollapsed = !isCollapsed">
          {{ isCollapsed ? '+' : '-' }}
        </button>
        <button type="button" class="btn-close" @click="emit('close')">
          &times;
        </button>
      </div>
    </div>

    <!-- Content (hidden when collapsed) -->
    <div v-if="!isCollapsed" class="panel-content">
      <!-- Team Toggle -->
      <div class="team-toggle">
        <button
          type="button"
          class="team-btn attacker"
          :class="{ active: selectedTeam === 'attacker' }"
          @click="selectedTeam = 'attacker'"
        >
          Attacker
        </button>
        <button
          type="button"
          class="team-btn defender"
          :class="{ active: selectedTeam === 'defender' }"
          @click="selectedTeam = 'defender'"
        >
          Defender
        </button>
      </div>

      <!-- Placement Mode Indicator -->
      <div v-if="placementMode && selectedItem" class="placement-indicator">
        <span>Click on arena to place:</span>
        <strong>{{ selectedItem.item.name }}</strong>
        <button type="button" class="btn-cancel" @click="cancelPlacement">Cancel</button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="loading">Loading units & buildings...</div>

      <!-- Error -->
      <div v-else-if="error" class="error">{{ error }}</div>

      <!-- Units and Buildings -->
      <template v-else>
        <!-- Units Section -->
        <div class="section">
          <div class="section-header">Units ({{ units.length }})</div>
          <div v-if="units.length === 0" class="empty">No units defined</div>
          <div v-else class="items-grid">
            <button
              v-for="unit in units"
              :key="unit.id"
              type="button"
              class="item-card"
              :class="{ selected: selectedItem?.item === unit }"
              @click="selectItem('unit', unit)"
            >
              <span
                class="category-dot"
                :style="{ backgroundColor: unitCategoryColors[unit.category] || '#888' }"
              ></span>
              <span class="item-name">{{ unit.name }}</span>
              <span class="item-stats">
                HP:{{ unit.health }} DMG:{{ unit.damage }}
              </span>
            </button>
          </div>
        </div>

        <!-- Buildings Section -->
        <div class="section">
          <div class="section-header">Buildings ({{ buildings.length }})</div>
          <div v-if="buildings.length === 0" class="empty">No buildings defined</div>
          <div v-else class="items-grid">
            <button
              v-for="building in buildings"
              :key="building.id"
              type="button"
              class="item-card"
              :class="{ selected: selectedItem?.item === building }"
              @click="selectItem('building', building)"
            >
              <span
                class="category-dot"
                :style="{ backgroundColor: buildingCategoryColors[building.category] || '#888' }"
              ></span>
              <span class="item-name">{{ building.name }}</span>
              <span class="item-stats">
                HP:{{ building.health }} {{ building.damage > 0 ? `DMG:${building.damage}` : '' }}
              </span>
            </button>
          </div>
        </div>
      </template>

      <!-- Footer -->
      <div class="panel-footer">
        <div class="entity-count">
          Placed: {{ entityCounts.units }} units, {{ entityCounts.buildings }} buildings
        </div>
        <button
          type="button"
          class="btn-clear"
          :disabled="totalEntities === 0"
          @click="handleClearAll"
        >
          Clear All
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.combat-dev-panel {
  position: absolute;
  top: 60px;
  left: 12px;
  width: 280px;
  max-height: calc(100vh - 80px);
  background: rgba(15, 20, 25, 0.95);
  border: 1px solid #2a3040;
  border-radius: 8px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.combat-dev-panel.collapsed {
  max-height: auto;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a3040;
  border-radius: 8px 8px 0 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #e5e5e5;
}

.dev-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  background: linear-gradient(135deg, #f97316, #dc2626);
  color: white;
  border-radius: 3px;
  letter-spacing: 0.5px;
}

.header-actions {
  display: flex;
  gap: 4px;
}

.btn-collapse,
.btn-close {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #6b7280;
  font-size: 16px;
  cursor: pointer;
  border-radius: 4px;
}

.btn-collapse:hover,
.btn-close:hover {
  background: #2a3040;
  color: #e5e5e5;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* Team Toggle */
.team-toggle {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.team-btn {
  flex: 1;
  padding: 8px 12px;
  border: 2px solid transparent;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.team-btn.attacker {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.3);
}

.team-btn.attacker.active {
  background: rgba(239, 68, 68, 0.3);
  border-color: #ef4444;
}

.team-btn.defender {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border-color: rgba(59, 130, 246, 0.3);
}

.team-btn.defender.active {
  background: rgba(59, 130, 246, 0.3);
  border-color: #3b82f6;
}

/* Placement Indicator */
.placement-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #86efac;
}

.placement-indicator strong {
  color: #4ade80;
}

.btn-cancel {
  margin-left: auto;
  padding: 4px 8px;
  background: rgba(239, 68, 68, 0.2);
  border: none;
  border-radius: 4px;
  color: #f87171;
  font-size: 11px;
  cursor: pointer;
}

.btn-cancel:hover {
  background: rgba(239, 68, 68, 0.3);
}

/* Loading/Error */
.loading,
.error {
  padding: 16px;
  text-align: center;
  font-size: 13px;
  color: #6b7280;
}

.error {
  color: #f87171;
}

/* Sections */
.section {
  margin-bottom: 16px;
}

.section-header {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #2a3040;
}

.empty {
  font-size: 12px;
  color: #4b5563;
  font-style: italic;
  padding: 8px;
}

/* Items Grid */
.items-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #1a1f2e;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.item-card:hover {
  background: #232938;
  border-color: #3b82f6;
}

.item-card.selected {
  background: rgba(34, 197, 94, 0.15);
  border-color: #22c55e;
}

.category-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.item-name {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: #e5e5e5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-stats {
  font-size: 10px;
  color: #6b7280;
  font-family: monospace;
}

/* Footer */
.panel-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid #2a3040;
}

.entity-count {
  font-size: 11px;
  color: #6b7280;
}

.btn-clear {
  padding: 6px 12px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 4px;
  color: #f87171;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-clear:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.25);
}

.btn-clear:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
