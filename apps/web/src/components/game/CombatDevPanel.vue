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
  attackableSelectionChange: [hasSelection: boolean];
}>();

// Get combat engine methods
const {
  engine,
  getEngine,
  initDevArena,
  hasArena,
  screenToArena,
  devSpawnUnitAtWorld,
  devPlaceBuilding,
  devClearAll,
  getDevEntityCount,
  selectBuilding,
  deselectBuilding,
  getSelectedBuildingId,
  getBuildingAtGridPosition,
  forceAttackGroundWorld,
  screenToWorld,
  issueKillCommand,
  cancelAllKillCommands,
  getUnitWorldPosition,
  getAllUnitIds,
  moveUnitToWorld,
  showMoveMarker,
  hideMoveMarker,
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

// Track placed buildings and their positions for click-to-select
// Maps building ID to building info including position and footprint
const placedBuildings = ref<
  Map<string, { id: string; def: DbBuildingDefinition; x: number; z: number }>
>(new Map());

// Track spawned units for kill commands
// Maps unit ID to unit info
const spawnedUnits = ref<
  Map<string, { id: string; def: DbUnitDefinition; team: 'attacker' | 'defender' }>
>(new Map());

// Currently selected placed building (for force attack)
const selectedPlacedBuildingId = ref<string | null>(null);

// Hover state for unit targeting
const hoveredUnitId = ref<string | null>(null);
const selectedTargetUnitId = ref<string | null>(null);
const selectedUnitId = ref<string | null>(null);

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

  if (selectedItem.value.type === 'unit') {
    // For units, use exact world coordinates (no grid snapping)
    const worldPos = screenToWorld(event.clientX, event.clientY);
    if (!worldPos) return;

    const unitDef = selectedItem.value.item as DbUnitDefinition;
    const unitId = devSpawnUnitAtWorld(unitDef, worldPos.x, worldPos.z, selectedTeam.value);
    // Track spawned unit for kill commands
    if (unitId) {
      spawnedUnits.value.set(unitId, { id: unitId, def: unitDef, team: selectedTeam.value });
    }
  } else {
    // For buildings, snap to grid (they occupy discrete tiles)
    const position = screenToArena(event.clientX, event.clientY);
    if (!position) return;

    const buildingDef = selectedItem.value.item as DbBuildingDefinition;
    const buildingId = devPlaceBuilding(buildingDef, position, selectedTeam.value);
    // Track placed building for click-to-select (store position for footprint checking)
    if (buildingId) {
      placedBuildings.value.set(buildingId, {
        id: buildingId,
        def: buildingDef,
        x: position.x,
        z: position.z,
      });
    }
  }

  // Update entity counts
  updateEntityCounts();
}

// Handle selection click (when not in placement mode)
function handleSelectionClick(event: MouseEvent) {
  const position = screenToArena(event.clientX, event.clientY);

  if (!position) {
    // Clicked outside arena - deselect
    deselectBuilding();
    selectedPlacedBuildingId.value = null;
    selectedTargetUnitId.value = null;
    getEngine()?.hideTargetRing();
    emit('attackableSelectionChange', false);
    return;
  }

  getEngine()?.hideTargetRing();

  // Check if there's a building at this position (checks full footprint via engine)
  const buildingInfo = getBuildingAtGridPosition(position.x, position.z);

  if (buildingInfo) {
    // Select this building - deselect any unit first
    selectBuilding(buildingInfo.id);
    selectedPlacedBuildingId.value = buildingInfo.id;
    selectedTargetUnitId.value = null;
    selectedUnitId.value = null;
    hideMoveMarker(); // Clear unit move marker
    // Check if building can attack (has range and damage)
    const canAttack = buildingInfo.range > 0 && buildingInfo.damage > 0;
    emit('attackableSelectionChange', canAttack);
    return;
  }

  // No building selected; allow unit selection for targeting
  const worldPos = screenToWorld(event.clientX, event.clientY);
  if (worldPos) {
    const targetUnitId = findUnitAtWorldPosition(worldPos.x, worldPos.z);
    if (targetUnitId) {
      deselectBuilding();
      selectedPlacedBuildingId.value = null;
      selectedTargetUnitId.value = null;
      selectedUnitId.value = targetUnitId;
      const unitPos = getUnitWorldPosition(targetUnitId);
      if (unitPos) {
        getEngine()?.showTargetRing(targetUnitId, unitPos.x, unitPos.z, 2.2);
      }
      hideMoveMarker();
      emit('attackableSelectionChange', selectedPlacedBuildingId.value != null);
      return;
    }

    if (selectedUnitId.value) {
      moveUnitToWorld(selectedUnitId.value, worldPos.x, worldPos.z);
      showMoveMarker(worldPos.x, worldPos.z);
      return;
    }
  }

  // Clicked empty space - deselect
  deselectBuilding();
  selectedPlacedBuildingId.value = null;
  selectedTargetUnitId.value = null;
  selectedUnitId.value = null;
  getEngine()?.hideTargetRing();
  hideMoveMarker();
  emit('attackableSelectionChange', false);
}

// Find unit near world position (within click tolerance)
function findUnitAtWorldPosition(worldX: number, worldZ: number): string | null {
  const clickTolerance = 8; // meters - how close click needs to be to unit center
  const unitIds = getAllUnitIds();

  for (const unitId of unitIds) {
    const unitPos = getUnitWorldPosition(unitId);
    if (!unitPos) continue;

    const dist = Math.sqrt(Math.pow(unitPos.x - worldX, 2) + Math.pow(unitPos.z - worldZ, 2));

    if (dist <= clickTolerance) {
      return unitId;
    }
  }
  return null;
}

// Try to attack a unit at click position (more reliable than hover-based)
// Returns true if a unit was targeted, false otherwise
function tryAttackAtClick(event: MouseEvent): boolean {
  if (!selectedPlacedBuildingId.value) return false;

  const worldPos = screenToWorld(event.clientX, event.clientY);
  if (!worldPos) return false;

  const targetUnitId = findUnitAtWorldPosition(worldPos.x, worldPos.z);
  if (!targetUnitId) return false;

  selectedTargetUnitId.value = targetUnitId;
  const unitPos = getUnitWorldPosition(targetUnitId);
  if (unitPos) {
    getEngine()?.showTargetRing(targetUnitId, unitPos.x, unitPos.z, 2.2);
  }

  if (selectedPlacedBuildingId.value) {
    issueKillCommand(selectedPlacedBuildingId.value, targetUnitId);
  }
  return true; // We handled the click (targeted a unit), even if the command failed
}

// Clear all dev entities
function handleClearAll() {
  devClearAll();
  placedBuildings.value.clear();
  spawnedUnits.value.clear();
  selectedPlacedBuildingId.value = null;
  hoveredUnitId.value = null;
  selectedTargetUnitId.value = null;
  selectedUnitId.value = null;
  cancelAllKillCommands();
  getEngine()?.hideTargetRing();
  hideMoveMarker();
  emit('attackableSelectionChange', false);
  updateEntityCounts();
}

// Update entity counts
function updateEntityCounts() {
  entityCounts.value = getDevEntityCount();
}

// Stop all active commands
function handleStopAll() {
  cancelAllKillCommands();
}

// Handle force attack (Ctrl+Click) - uses precise world coordinates
function handleForceAttack(event: MouseEvent) {
  const currentSelection = getSelectedBuildingId();

  if (!currentSelection) {
    return;
  }

  // Use screenToWorld for precise targeting (no tile snapping)
  const worldPos = screenToWorld(event.clientX, event.clientY);

  if (!worldPos) {
    return;
  }

  // Execute force attack with precise world coordinates
  forceAttackGroundWorld(currentSelection, worldPos.x, worldPos.z);
}

// Handle mouse move for unit hover detection
function handleMouseMove(event: MouseEvent) {
  // Only show targeting cursor when a turret is selected and not in placement mode
  if (placementMode.value) {
    hoveredUnitId.value = null;
    return;
  }

  if (!selectedPlacedBuildingId.value && !selectedUnitId.value) {
    hoveredUnitId.value = null;
    return;
  }

  const worldPos = screenToWorld(event.clientX, event.clientY);
  if (!worldPos) {
    hoveredUnitId.value = null;
    return;
  }

  if (selectedPlacedBuildingId.value) {
    const newHoveredUnitId = findUnitAtWorldPosition(worldPos.x, worldPos.z);
    hoveredUnitId.value = newHoveredUnitId;
  } else {
    hoveredUnitId.value = null;
  }

  if (selectedTargetUnitId.value) {
    const targetPos = getUnitWorldPosition(selectedTargetUnitId.value);
    if (targetPos) {
      const combatEngine = getEngine();
      combatEngine?.showTargetRing(selectedTargetUnitId.value, targetPos.x, targetPos.z, 2.2);
      combatEngine?.updateTargetRingPosition(targetPos.x, targetPos.z);
    }
  } else if (selectedUnitId.value) {
    const unitPos = getUnitWorldPosition(selectedUnitId.value);
    if (unitPos) {
      const combatEngine = getEngine();
      combatEngine?.showTargetRing(selectedUnitId.value, unitPos.x, unitPos.z, 2.2);
      combatEngine?.updateTargetRingPosition(unitPos.x, unitPos.z);
    }
  } else {
    getEngine()?.hideTargetRing();
  }
}

// Handle click to issue kill command on hovered unit
function handleUnitTargetClick(_event: MouseEvent) {
  if (!selectedPlacedBuildingId.value || !hoveredUnitId.value) return;

  selectedTargetUnitId.value = hoveredUnitId.value;
  const unitPos = getUnitWorldPosition(selectedTargetUnitId.value);
  if (unitPos) {
    getEngine()?.showTargetRing(selectedTargetUnitId.value, unitPos.x, unitPos.z, 2.2);
  }
  issueKillCommand(selectedPlacedBuildingId.value, hoveredUnitId.value);
}

// Cancel placement mode
function cancelPlacement() {
  selectedItem.value = null;
  placementMode.value = false;
  emit('placementModeChange', false);
}

// Handle escape key
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && placementMode.value) {
    cancelPlacement();
  }
  if (event.key === 'Escape' && selectedUnitId.value) {
    const unitPos = getUnitWorldPosition(selectedUnitId.value);
    if (unitPos) {
      moveUnitToWorld(selectedUnitId.value, unitPos.x, unitPos.z);
    }
    selectedUnitId.value = null;
    selectedTargetUnitId.value = null;
    getEngine()?.hideTargetRing();
    hideMoveMarker();
  }
}

// Expose click handlers for parent to wire up
defineExpose({
  handleArenaClick,
  handleSelectionClick,
  handleForceAttack,
  handleMouseMove,
  handleUnitTargetClick,
  tryAttackAtClick,
  hoveredUnitId,
  selectedUnitId,
});

// Track if we've already initialized in this component instance
let hasInitializedArena = false;

// Watch for engine to be ready, then initialize dev arena
watch(
  engine,
  (newEngine) => {
    if (newEngine && !hasArena()) {
      if (hasInitializedArena) {
        console.warn('CombatDevPanel: Arena was cleared unexpectedly, reinitializing...');
      }
      initDevArena();
      hasInitializedArena = true;
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
        <button type="button" class="btn-close" @click="emit('close')">&times;</button>
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
              <span class="item-stats"> HP:{{ unit.health }} DMG:{{ unit.damage }} </span>
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

        <!-- Combat Controls -->
        <div class="section combat-controls-section">
          <div class="section-header">Combat Controls</div>
          <div class="combat-hint">Select a turret, then click on enemy units to attack</div>
          <button type="button" class="btn-stop" @click="handleStopAll">⏹ Stop All</button>
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

/* Combat Controls Section */
.combat-controls-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.combat-hint {
  font-size: 11px;
  color: #9ca3af;
  margin-bottom: 8px;
  text-align: center;
}

.btn-stop {
  width: 100%;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: #f87171;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-stop:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.5);
}
</style>
