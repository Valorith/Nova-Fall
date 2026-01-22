<script setup lang="ts">
/**
 * CombatView - 3D Combat Arena Component
 *
 * This component renders the Babylon.js 3D combat arena during battles.
 * It's designed to be shown/hidden using v-show (NOT v-if) to preserve
 * the WebGL context.
 *
 * Usage:
 * <CombatView v-show="inCombat" ref="combatView" />
 */

import { ref, computed, onMounted, onUnmounted, defineExpose, watch } from 'vue';
import { useCombatEngine } from '../../composables/useCombatEngine';
import CombatDevPanel from './CombatDevPanel.vue';
import CombatStoragePanel, { type StorageItemEntry } from './CombatStoragePanel.vue';
import { CombatPhase } from '@nova-fall/shared';
import type { CombatResult, DbItemDefinition, DbUnitDefinition, DbBuildingDefinition } from '@nova-fall/shared';
import { useItemsStore } from '@/stores/items';
import { useGameStore } from '@/stores/game';
import { unitsApi, buildingsApi } from '@/services/api';
import { TILE_SIZE, ARENA_SIZE } from '@/game/combat';

// Props
interface Props {
  visible?: boolean;
}

withDefaults(defineProps<Props>(), {
  visible: false,
});

// Emits
const emit = defineEmits<{
  (e: 'exit'): void;
  (e: 'combatEnd', result: CombatResult): void;
}>();

// Combat engine composable
const {
  isActive,
  isLoading,
  isConnected,
  error,
  currentBattleId,
  currentNodeId,
  currentPlayerId,
  combatPhase,
  combatResult,
  coreHealth,
  coreHealthPercent,
  formattedTimeRemaining,
  initEngine,
  enterCombat,
  exitCombat,
  sendInput,
  updateState,
  handleCombatEnd,
  rotateCamera,
  resetCamera,
  screenToWorld,
  devSpawnUnitAtWorld,
  devPlaceBuilding,
  getEngine,
  getBuildingFootprint,
  hasArena: _hasArena,
  showPlacementPreview,
  hidePlacementPreview,
  hideMoveMarker,
  getSelectedBuildingId,
  destroyBuilding,
  preloadModels,
} = useCombatEngine();

const itemsStore = useItemsStore();
const gameStore = useGameStore();

const storageVisible = ref(true);
const combatStorage = ref<Record<string, number>>({});
const dragItem = ref<StorageItemEntry | null>(null);
const dragDefinition = ref<{
  type: 'unit' | 'building';
  unitDef?: DbUnitDefinition;
  buildingDef?: DbBuildingDefinition;
  tileWidth: number;
  tileHeight: number;
  modelPath: string | null;
} | null>(null);
const dragWorld = ref<{ x: number; z: number } | null>(null);
const dragValid = ref(false);
const dragPreviewTile = ref<{ x: number; z: number; width: number; height: number } | null>(null);
const dragExitedStorage = ref(false);
const dragOverStorage = ref(false);
const lastDragClient = ref<{ x: number; y: number } | null>(null);
const dragStartClient = ref<{ x: number; y: number } | null>(null);
const dragMoved = ref(false);
const dragDebug = ref<{ active: boolean; x: number | null; z: number | null }>({
  active: false,
  x: null,
  z: null,
});
const placedUnitItems = ref<Map<string, string>>(new Map());
const placedBuildingItems = ref<Map<string, string>>(new Map());

const unitDefCache = new Map<string, DbUnitDefinition>();
const buildingDefCache = new Map<string, DbBuildingDefinition>();

const isAttacker = computed(() => {
  const engine = getEngine();
  if (!engine || !currentPlayerId.value) return false;
  return currentPlayerId.value === engine.attackerId;
});

const isDefender = computed(() => {
  const engine = getEngine();
  if (!engine || !currentPlayerId.value) return false;
  return currentPlayerId.value === engine.defenderId;
});

const canPlaceItems = computed(() => {
  const phase = combatPhase.value;
  if (!currentPlayerId.value) return true;
  if (!phase) return true;
  if (!isAttacker.value && !isDefender.value) return true;
  if (isAttacker.value) {
    return phase === CombatPhase.DEPLOY;
  }
  if (isDefender.value) {
    return phase === CombatPhase.DEPLOY || phase === CombatPhase.LOADING;
  }
  return false;
});

const storageItems = computed<StorageItemEntry[]>(() => {
  const storage = combatStorage.value;
  const items = itemsStore.getStorageItems(storage);
  return items
    .map((entry) => {
      const item = itemsStore.getItem(entry.itemId);
      if (!item) return null;
      const type = item.unitDefinitionId ? 'unit' : item.buildingDefinitionId ? 'building' : null;
      if (!type) return null;
      return {
        itemId: entry.itemId,
        amount: entry.amount,
        item,
        type,
      } as StorageItemEntry;
    })
    .filter((entry): entry is StorageItemEntry => entry !== null);
});

// Preload models when storage items change for faster drag preview
watch(storageItems, async (items) => {
  if (!items.length) return;

  // Collect model paths from items
  const modelPaths: string[] = [];
  for (const entry of items) {
    if (entry.type === 'unit' && entry.item.unitDefinition?.modelPath) {
      modelPaths.push(entry.item.unitDefinition.modelPath);
    } else if (entry.type === 'building' && entry.item.buildingDefinition?.modelPath) {
      modelPaths.push(entry.item.buildingDefinition.modelPath);
    }
  }

  // Preload unique models
  const uniquePaths = [...new Set(modelPaths)];
  if (uniquePaths.length > 0) {
    void preloadModels(uniquePaths);
  }
}, { immediate: true });

const selectedUnitId = computed(() => devPanelRef.value?.selectedUnitId ?? null);
const canRepackage = computed(() => {
  if (!selectedUnitId.value || !isAttacker.value) return false;
  const engine = getEngine();
  if (!engine) return false;
  const unitPos = engine.getUnitWorldPosition(selectedUnitId.value);
  if (!unitPos || !engine.arenaLayout) return false;
  const gridX = Math.floor(unitPos.x / TILE_SIZE);
  const gridZ = Math.floor(unitPos.z / TILE_SIZE);
  const tile = engine.arenaLayout[gridX]?.[gridZ];
  if (!hasSpawnZone.value) return false;
  return tile === 'spawn_zone';
});

const showUnitActions = computed(() => selectedUnitId.value != null);
const selectedBuildingId = computed(() => getSelectedBuildingId());
const canDestroyBuilding = computed(() => isDefender.value && selectedBuildingId.value != null);

const hasSpawnZone = computed(() => {
  const engine = getEngine();
  if (!engine || !engine.arenaLayout) return false;
  return engine.arenaLayout.some((row) => row.some((tile) => tile === 'spawn_zone'));
});

const normalizeStorage = (storage: Record<string, number> | undefined): Record<string, number> => {
  return storage ? { ...storage } : {};
};

watch(
  () => [currentNodeId.value, isActive.value] as const,
  ([nodeId, active]) => {
    if (!active || !nodeId) return;
    const node = gameStore.getNode(nodeId);
    combatStorage.value = normalizeStorage((node?.storage as Record<string, number>) ?? {});
  },
  { immediate: true }
);

const resolveUnitDefinition = async (item: DbItemDefinition): Promise<DbUnitDefinition | null> => {
  if (item.unitDefinition) return item.unitDefinition;
  if (!item.unitDefinitionId) return null;
  const cached = unitDefCache.get(item.unitDefinitionId);
  if (cached) return cached;
  const response = await unitsApi.getById(item.unitDefinitionId);
  unitDefCache.set(item.unitDefinitionId, response.data);
  return response.data;
};

const resolveBuildingDefinition = async (
  item: DbItemDefinition
): Promise<DbBuildingDefinition | null> => {
  if (item.buildingDefinition) return item.buildingDefinition;
  if (!item.buildingDefinitionId) return null;
  const cached = buildingDefCache.get(item.buildingDefinitionId);
  if (cached) return cached;
  const response = await buildingsApi.getById(item.buildingDefinitionId);
  buildingDefCache.set(item.buildingDefinitionId, response.data);
  return response.data;
};

const getStorageRect = (): DOMRect | null => {
  if (!storageVisible.value) return null;
  // Note: Vue exposes refs unwrapped, so panelRef is already the HTMLElement, not a Ref
  const panel = storagePanelRef.value?.panelRef;
  if (panel) return panel.getBoundingClientRect();
  const fallbackLeft = Math.max(window.innerWidth - 280, 0);
  const fallbackTop = 80;
  const fallbackBottom = window.innerHeight - 40;
  return new DOMRect(fallbackLeft, fallbackTop, 280, Math.max(fallbackBottom - fallbackTop, 0));
};

const isCursorOverStorage = (event: Event & { clientX?: number; clientY?: number }): boolean => {
  const rect = getStorageRect();
  if (!rect) return false;
  const clientX = event.clientX ?? -1;
  const clientY = event.clientY ?? -1;
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return false;
  }
  return true;
};

const setDragCursor = (active: boolean) => {
  document.body.style.cursor = active ? 'grabbing' : '';
};

const handleStorageDragStart = async (item: StorageItemEntry, event: PointerEvent | MouseEvent) => {
  if (!canPlaceItems.value) return;
  event.preventDefault();
  event.stopPropagation();
  setDragCursor(true);
  dragItem.value = item;
  dragDebug.value = { active: true, x: null, z: null };
  dragValid.value = false;
  dragExitedStorage.value = false;
  dragOverStorage.value = true;
  dragMoved.value = false;
  lastDragClient.value = { x: event.clientX, y: event.clientY };
  dragStartClient.value = { x: event.clientX, y: event.clientY };
  dragDefinition.value = {
    type: item.type,
    tileWidth: 1,
    tileHeight: 1,
    modelPath: null,
  };

  if (event instanceof PointerEvent) {
    document.addEventListener('pointermove', handleDragMove, { passive: false, capture: true });
    document.addEventListener('pointerup', handleDragEnd, { once: true, capture: true });
  } else {
    document.addEventListener('mousemove', handleMouseDragMove, { passive: false, capture: true });
    document.addEventListener('mouseup', handleMouseDragEnd, { once: true, capture: true });
  }
  // Wait for actual movement before previewing/placing

  if (item.type === 'unit') {
    const unitDef = await resolveUnitDefinition(item.item);
    if (!unitDef) return;
    dragDefinition.value = {
      type: 'unit',
      unitDef,
      tileWidth: unitDef.tileSize ?? 1,
      tileHeight: unitDef.tileSize ?? 1,
      modelPath: unitDef.modelPath ?? null,
    };
    // Use current mouse position, not original click position
    if (dragItem.value && lastDragClient.value) {
      void handleDragMove({ clientX: lastDragClient.value.x, clientY: lastDragClient.value.y } as PointerEvent);
    }
  }

  if (item.type === 'building') {
    if (isAttacker.value) {
      return;
    }
    const buildingDef = await resolveBuildingDefinition(item.item);
    if (!buildingDef) return;
    dragDefinition.value = {
      type: 'building',
      buildingDef,
      tileWidth: buildingDef.width ?? 1,
      tileHeight: buildingDef.height ?? 1,
      modelPath: buildingDef.modelPath ?? null,
    };
    // Use current mouse position, not original click position
    if (dragItem.value && lastDragClient.value) {
      void handleDragMove({ clientX: lastDragClient.value.x, clientY: lastDragClient.value.y } as PointerEvent);
    }
  }
};

const handleMouseDragMove = (event: MouseEvent) => {
  void handleDragMove(event as unknown as PointerEvent);
};

const handleMouseDragEnd = (event: MouseEvent) => {
  void handleDragEnd(event);
};

const handleDragMove = async (event: PointerEvent | MouseEvent) => {
  if (!dragItem.value || !dragDefinition.value) return;
  const overStorage = isCursorOverStorage(event as Event & { clientX?: number; clientY?: number });
  dragOverStorage.value = overStorage;
  lastDragClient.value = { x: event.clientX, y: event.clientY };
  if (dragStartClient.value) {
    const dx = event.clientX - dragStartClient.value.x;
    const dy = event.clientY - dragStartClient.value.y;
    if (!dragMoved.value && Math.hypot(dx, dy) > 4) {
      dragMoved.value = true;
    }
  }
  if (!dragMoved.value) {
    return;
  }
  if (overStorage) {
    dragValid.value = false;
    dragExitedStorage.value = false;
    hidePlacementPreview();
    return;
  }
  dragExitedStorage.value = true;
  const worldPos = screenToWorld(event.clientX, event.clientY);
  if (!worldPos) {
    dragValid.value = false;
    hidePlacementPreview();
    return;
  }
  dragDebug.value = { active: true, x: worldPos.x, z: worldPos.z };

  const engine = getEngine();
  if (!engine) return;
  const arenaLayout = engine.arenaLayout;

  const { tileWidth, tileHeight, type, modelPath } = dragDefinition.value;

  const gridX = Math.floor(worldPos.x / TILE_SIZE);
  const gridZ = Math.floor(worldPos.z / TILE_SIZE);
  const snappedX = (gridX + tileWidth / 2) * TILE_SIZE;
  const snappedZ = (gridZ + tileHeight / 2) * TILE_SIZE;

  dragWorld.value = { x: snappedX, z: snappedZ };
  dragPreviewTile.value = { x: gridX, z: gridZ, width: tileWidth, height: tileHeight };

  const valid = isPlacementValid(type, gridX, gridZ, tileWidth, tileHeight, arenaLayout ?? null);
  dragValid.value = valid;

  // Only show preview if we have a model path (definition resolved)
  // This prevents hide/create cycles when definition is still loading
  if (modelPath) {
    showPlacementPreview(modelPath, tileWidth, tileHeight, snappedX, snappedZ, valid);
  }
};

const cancelDrag = () => {
  setDragCursor(false);
  dragItem.value = null;
  dragDefinition.value = null;
  dragValid.value = false;
  dragOverStorage.value = false;
  dragExitedStorage.value = false;
  dragMoved.value = false;
  dragStartClient.value = null;
  dragDebug.value = { active: false, x: null, z: null };
  hidePlacementPreview();
};

const handleDragEnd = async (event?: PointerEvent | MouseEvent) => {
  document.removeEventListener('pointermove', handleDragMove as unknown as (e: Event) => void);
  document.removeEventListener('mousemove', handleMouseDragMove as unknown as (e: Event) => void);
  document.removeEventListener('pointerup', handleDragEnd as unknown as (e: Event) => void);
  document.removeEventListener('mouseup', handleMouseDragEnd as unknown as (e: Event) => void);

  if (!dragItem.value || !dragDefinition.value) return;
  const endEvent = event ?? (lastDragClient.value ? ({ clientX: lastDragClient.value.x, clientY: lastDragClient.value.y } as PointerEvent) : undefined);
  const overStorage = endEvent
    ? isCursorOverStorage(endEvent as Event & { clientX?: number; clientY?: number })
    : dragOverStorage.value;
  if (!dragMoved.value || !dragExitedStorage.value || overStorage) {
    cancelDrag();
    return;
  }
  if (!dragValid.value || !dragWorld.value || !dragPreviewTile.value) {
    cancelDrag();
    return;
  }

  const item = dragItem.value;
  const definition = dragDefinition.value;
  const world = dragWorld.value;
  const tile = dragPreviewTile.value;

  if (item.type === 'unit') {
    const unitDef = definition.unitDef ?? (await resolveUnitDefinition(item.item));
    if (unitDef) {
      const unitId = devSpawnUnitAtWorld(unitDef, world.x, world.z, isAttacker.value ? 'attacker' : 'defender');
      if (unitId) {
        placedUnitItems.value.set(unitId, item.itemId);
        updateStorage(item.itemId, -1);
      }
    }
  }

  if (item.type === 'building') {
    if (isAttacker.value) {
      hidePlacementPreview();
      dragItem.value = null;
      dragDefinition.value = null;
      return;
    }
    const buildingDef = definition.buildingDef ?? (await resolveBuildingDefinition(item.item));
    if (buildingDef) {
      const buildingId = devPlaceBuilding(buildingDef, { x: tile.x, z: tile.z }, isDefender.value ? 'defender' : 'attacker');
      if (buildingId) {
        placedBuildingItems.value.set(buildingId, item.itemId);
        updateStorage(item.itemId, -1);
      }
    }
  }

  hidePlacementPreview();
  cancelDrag();
};

const updateStorage = (itemId: string, delta: number) => {
  const current = combatStorage.value[itemId] ?? 0;
  const next = Math.max(0, current + delta);
  if (next === 0) {
    const { [itemId]: _, ...rest } = combatStorage.value;
    combatStorage.value = rest;
    return;
  }
  combatStorage.value = { ...combatStorage.value, [itemId]: next };
};

const isPlacementValid = (
  type: 'unit' | 'building',
  gridX: number,
  gridZ: number,
  tileWidth: number,
  tileHeight: number,
  arenaLayout: string[][] | null
) => {
  const engine = getEngine();
  if (!engine) return false;
  if (type === 'building' && isAttacker.value) return false;
  if (gridX < 0 || gridZ < 0 || gridX + tileWidth > ARENA_SIZE || gridZ + tileHeight > ARENA_SIZE) {
    return false;
  }

  for (let x = gridX; x < gridX + tileWidth; x++) {
    for (let z = gridZ; z < gridZ + tileHeight; z++) {
      const tile = arenaLayout?.[x]?.[z] ?? 'walkable';
      if (tile === 'blocked' || tile === 'hq_zone') {
        return false;
      }
      if (type === 'unit' && isAttacker.value && hasSpawnZone.value && tile !== 'spawn_zone') {
        return false;
      }
      if (isTileOccupied(x, z)) {
        return false;
      }
    }
  }

  return true;
};

const isTileOccupied = (gridX: number, gridZ: number) => {
  const engine = getEngine();
  if (!engine) return false;
  for (const building of engine.getPlacedBuildings()) {
    const data = getBuildingFootprint(building.id);
    if (!data) continue;
    if (gridX >= data.x && gridX < data.x + data.width && gridZ >= data.z && gridZ < data.z + data.height) {
      return true;
    }
  }
  return false;
};

const handleRepackage = () => {
  if (!selectedUnitId.value) return;
  const itemId = placedUnitItems.value.get(selectedUnitId.value);
  if (!itemId) return;
  const engine = getEngine();
  if (!engine) return;
  engine.removeUnit(selectedUnitId.value);
  placedUnitItems.value.delete(selectedUnitId.value);
  updateStorage(itemId, 1);
  hideMoveMarker();
};

const handleDestroyBuilding = () => {
  if (!selectedBuildingId.value) return;
  destroyBuilding(selectedBuildingId.value);
  placedBuildingItems.value.delete(selectedBuildingId.value);
};

// Canvas reference
const canvasRef = ref<HTMLCanvasElement | null>(null);

// Dev panel state
const showDevPanel = ref(true); // Show by default in dev mode
const devPanelRef = ref<InstanceType<typeof CombatDevPanel> | null>(null);
const storagePanelRef = ref<InstanceType<typeof CombatStoragePanel> | null>(null);
const isPlacementMode = ref(false);

// Ctrl key state for force attack cursor
const isCtrlHeld = ref(false);

// Track if an attackable building is selected (has range > 0)
const hasAttackableSelection = ref(false);

// Handle placement mode change from dev panel
const handlePlacementModeChange = (active: boolean) => {
  isPlacementMode.value = active;
};

// Handle attackable selection change from dev panel
const handleAttackableSelectionChange = (hasSelection: boolean) => {
  hasAttackableSelection.value = hasSelection;
};

// Track if hovering over a unit (for targeting cursor)
const isTargetingUnit = computed(() => {
  return devPanelRef.value?.hoveredUnitId != null;
});

const isMoveMode = computed(() => {
  return devPanelRef.value?.selectedUnitId != null;
});

// Handle mouse move for unit hover detection
const handleMouseMove = (event: MouseEvent) => {
  if (devPanelRef.value) {
    devPanelRef.value.handleMouseMove(event);
  }
  if (dragItem.value) {
    void handleDragMove(event as PointerEvent);
  }
};

// Handle right-click (Ctrl+Click on macOS) for force attack
const handleRightClick = (event: MouseEvent) => {
  if (devPanelRef.value && hasAttackableSelection.value) {
    devPanelRef.value.handleForceAttack(event);
  }
};

// Handle canvas click - forward to dev panel if in placement mode
const handleCanvasClick = (event: MouseEvent) => {
  // Placement mode takes priority
  if (isPlacementMode.value && devPanelRef.value) {
    devPanelRef.value.handleArenaClick(event);
    return;
  }

  // Check for Ctrl+Click force attack
  if (event.ctrlKey && devPanelRef.value) {
    devPanelRef.value.handleForceAttack(event);
    return;
  }

  // If a turret is selected, try to attack a unit at click position
  // This is more reliable than hover-based targeting
  if (hasAttackableSelection.value && devPanelRef.value) {
    const handled = devPanelRef.value.tryAttackAtClick(event);
    if (handled) return;
  }

  // Regular click - try to select a building
  if (devPanelRef.value) {
    devPanelRef.value.handleSelectionClick(event);
  }
};

// Track Ctrl key for force attack mode
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Control') {
    isCtrlHeld.value = true;
  }
};

const handleKeyUp = (event: KeyboardEvent) => {
  if (event.key === 'Control') {
    isCtrlHeld.value = false;
  }
};

// Initialize engine when mounted
onMounted(() => {
  if (canvasRef.value) {
    initEngine(canvasRef.value);
  }
  itemsStore.loadItems();
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
});

// Expose methods for parent component
defineExpose({
  enterCombat,
  exitCombat,
  sendInput,
  updateState,
  handleCombatEnd,
  isActive,
  isConnected,
  currentBattleId,
  combatResult,
});

// Handle exit button
const handleExit = () => {
  exitCombat();
  emit('exit');
};

// Handle camera rotation
const handleRotateLeft = () => rotateCamera('left');
const handleRotateRight = () => rotateCamera('right');
</script>

<template>
  <div class="combat-view">
    <!-- Babylon.js Canvas -->
    <canvas
      ref="canvasRef"
      class="combat-canvas"
      :class="{
        'placement-mode': isPlacementMode,
        'force-attack-mode': isCtrlHeld && !isPlacementMode && hasAttackableSelection,
        'target-mode': isTargetingUnit && !isPlacementMode,
        'move-mode': isMoveMode && !isPlacementMode
      }"
      @click="handleCanvasClick"
      @mousemove="handleMouseMove"
      @contextmenu.prevent="handleRightClick"
    />

    <CombatStoragePanel
      ref="storagePanelRef"
      :items="storageItems"
      :visible="storageVisible"
      @drag-start="handleStorageDragStart"
      @drag-cancel="cancelDrag"
      @toggle="storageVisible = !storageVisible"
    />

    <div v-if="dragDebug.active" class="drag-debug">
      Drag {{ dragDebug.x?.toFixed(1) ?? '-' }}, {{ dragDebug.z?.toFixed(1) ?? '-' }}
    </div>

    <div v-if="showUnitActions || canDestroyBuilding" class="unit-action-bar">
      <div class="unit-action-title">Actions</div>
      <button v-if="canRepackage" class="action-btn" @click="handleRepackage">
        Repackage
      </button>
      <button v-if="canDestroyBuilding" class="action-btn" @click="handleDestroyBuilding">
        Destroy Building
      </button>
      <span v-if="!canRepackage && !canDestroyBuilding" class="action-disabled">
        No actions available
      </span>
    </div>

    <!-- Loading Overlay -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner" />
      <p>Loading Battle Arena...</p>
    </div>

    <!-- Waiting Overlay (visible but combat not yet initialized - e.g., after page refresh) -->
    <div v-if="visible && !isActive && !isLoading && !error" class="loading-overlay">
      <div class="loading-spinner" />
      <p>Initializing Combat...</p>
    </div>

    <!-- Error Overlay -->
    <div v-if="error" class="error-overlay">
      <p class="error-message">{{ error }}</p>
      <button class="btn-secondary" @click="handleExit">Return to Map</button>
    </div>

    <!-- Combat HUD -->
    <div v-if="isActive && !isLoading" class="combat-hud">
      <!-- Top Bar -->
      <div class="hud-top">
        <div class="timer">
          <span class="timer-label">Time</span>
          <span class="timer-value">{{ formattedTimeRemaining }}</span>
        </div>
        <div class="hq-health">
          <span class="hq-label">Core Health</span>
          <div class="hq-bar">
            <div
              class="hq-bar-fill"
              :class="coreHealth.damageState"
              :style="{ width: coreHealthPercent + '%' }"
            />
          </div>
          <span class="hq-percent" :class="coreHealth.damageState">{{ coreHealthPercent }}%</span>
        </div>
      </div>

      <!-- Camera Controls -->
      <div class="camera-controls">
        <button class="btn-icon" title="Rotate Left (Q)" @click="handleRotateLeft">
          &#8634;
        </button>
        <button class="btn-icon" title="Reset Camera" @click="resetCamera">
          &#8962;
        </button>
        <button class="btn-icon" title="Rotate Right (E)" @click="handleRotateRight">
          &#8635;
        </button>
      </div>

      <!-- Bottom Bar -->
      <div class="hud-bottom">
        <button class="btn-secondary" @click="handleExit">
          Exit Combat
        </button>
      </div>
    </div>

    <!-- Dev Panel -->
    <CombatDevPanel
      ref="devPanelRef"
      :visible="showDevPanel"
      @close="showDevPanel = false"
      @placement-mode-change="handlePlacementModeChange"
      @attackable-selection-change="handleAttackableSelectionChange"
    />
  </div>
</template>

<style scoped>
.combat-view {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: #0a0a0f;
}

.combat-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
  z-index: 1;
}

.combat-canvas.placement-mode {
  cursor: crosshair;
}

.combat-canvas.force-attack-mode {
  cursor: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="none" stroke="%23ff3333" stroke-width="2"/><line x1="16" y1="2" x2="16" y2="10" stroke="%23ff3333" stroke-width="2"/><line x1="16" y1="22" x2="16" y2="30" stroke="%23ff3333" stroke-width="2"/><line x1="2" y1="16" x2="10" y2="16" stroke="%23ff3333" stroke-width="2"/><line x1="22" y1="16" x2="30" y2="16" stroke="%23ff3333" stroke-width="2"/><circle cx="16" cy="16" r="2" fill="%23ff3333"/></svg>') 16 16, crosshair;
}

/* Target mode - hovering over an attackable unit */
.combat-canvas.target-mode {
  cursor: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="none" stroke="%23ff3333" stroke-width="2"/><line x1="16" y1="2" x2="16" y2="10" stroke="%23ff3333" stroke-width="2"/><line x1="16" y1="22" x2="16" y2="30" stroke="%23ff3333" stroke-width="2"/><line x1="2" y1="16" x2="10" y2="16" stroke="%23ff3333" stroke-width="2"/><line x1="22" y1="16" x2="30" y2="16" stroke="%23ff3333" stroke-width="2"/><circle cx="16" cy="16" r="2" fill="%23ff3333"/></svg>') 16 16, crosshair;
}

.combat-canvas.move-mode {
  cursor: move;
}

.unit-action-bar {
  position: absolute;
  top: 120px;
  left: 20px;
  background: rgba(17, 24, 39, 0.92);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 12px;
  padding: 12px 14px;
  min-width: 160px;
  z-index: 12;
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drag-debug {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(71, 85, 105, 0.6);
  color: #cbd5f5;
  font-size: 11px;
  padding: 6px 10px;
  border-radius: 8px;
  z-index: 12;
}

.unit-action-title {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.action-btn {
  background: #1e293b;
  border: 1px solid rgba(59, 130, 246, 0.6);
  color: #f8fafc;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}

.action-btn:hover {
  background: #334155;
}

.action-disabled {
  font-size: 12px;
  color: #64748b;
}

/* Loading Overlay */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 15, 0.9);
  color: #fff;
  z-index: 100;
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #333;
  border-top-color: #4fc3f7;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Error Overlay */
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 15, 0.95);
  color: #fff;
  z-index: 100;
}

.error-message {
  color: #ef5350;
  margin-bottom: 16px;
  font-size: 1.1rem;
}

/* Combat HUD */
.combat-hud {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
}

.combat-hud > * {
  pointer-events: auto;
}

/* Top Bar */
.hud-top {
  position: absolute;
  top: 56px; /* Just below the navbar */
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 24px;
  background: rgba(0, 0, 0, 0.75);
  padding: 8px 20px;
  border-radius: 0 0 8px 8px;
  border: 1px solid #333;
  border-top: none;
}

.timer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timer-label {
  font-size: 0.7rem;
  color: #888;
  text-transform: uppercase;
}

.timer-value {
  font-size: 1.5rem;
  font-weight: bold;
  color: #fff;
  font-variant-numeric: tabular-nums;
}

.hq-health {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hq-label {
  font-size: 0.7rem;
  color: #888;
  text-transform: uppercase;
  white-space: nowrap;
}

.hq-bar {
  width: 180px;
  height: 10px;
  background: #1a1a24;
  border-radius: 5px;
  overflow: hidden;
  border: 1px solid #333;
}

.hq-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #8bc34a);
  transition: width 0.3s ease, background 0.3s ease;
}

.hq-bar-fill.healthy {
  background: linear-gradient(90deg, #4caf50, #8bc34a);
}

.hq-bar-fill.damaged {
  background: linear-gradient(90deg, #ff9800, #ffc107);
}

.hq-bar-fill.critical {
  background: linear-gradient(90deg, #f44336, #e91e63);
  animation: pulse-critical 1s ease-in-out infinite;
}

@keyframes pulse-critical {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.hq-percent {
  font-size: 0.85rem;
  font-weight: 600;
  color: #8bc34a;
  min-width: 40px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  transition: color 0.3s ease;
}

.hq-percent.healthy {
  color: #8bc34a;
}

.hq-percent.damaged {
  color: #ffc107;
}

.hq-percent.critical {
  color: #f44336;
}

/* Camera Controls */
.camera-controls {
  position: absolute;
  bottom: 80px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid #444;
  border-radius: 8px;
  color: #fff;
  font-size: 1.25rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-icon:hover {
  background: rgba(60, 60, 80, 0.8);
  border-color: #666;
}

/* Bottom Bar */
.hud-bottom {
  position: absolute;
  bottom: 16px;
  left: 16px;
}

.btn-secondary {
  padding: 10px 20px;
  background: rgba(60, 60, 80, 0.8);
  border: 1px solid #555;
  border-radius: 6px;
  color: #fff;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-secondary:hover {
  background: rgba(80, 80, 100, 0.9);
  border-color: #777;
}
</style>
