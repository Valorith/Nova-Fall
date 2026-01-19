/**
 * useCombatEngine - Vue composable for managing the Babylon.js combat engine
 *
 * This composable handles:
 * - Engine lifecycle (init, start, stop, dispose)
 * - Combat state management
 * - View switching between tactical map and combat mode
 * - WebSocket combat event handling
 *
 * NOTE: State is shared across all components that use this composable.
 * This is intentional - there's only one combat engine instance.
 */

import { ref, shallowRef, onMounted, onUnmounted, readonly, computed, toRaw } from 'vue';
import { CombatEngine } from '../game/combat';
import type {
  CombatSetup,
  CombatState,
  CombatResult,
  CombatInput,
  HQState,
  ArenaPosition,
  DbUnitDefinition,
  DbBuildingDefinition,
} from '@nova-fall/shared';
import { gameSocket, type CombatErrorEvent } from '../services/socket';
import { trackCombatInput, trackCombatState } from '@/utils/metricsTracker';

// Shared state - singleton pattern for combat engine
// All components using this composable share the same engine instance
const engine = shallowRef<CombatEngine | null>(null);
const engineInstance = shallowRef<CombatEngine | null>(null);
const isActive = ref(false);
const isLoading = ref(false);
const isConnected = ref(false);
const currentBattleId = ref<string | null>(null);
const currentPlayerId = ref<string | null>(null);
const combatResult = ref<CombatResult | null>(null);
const error = ref<string | null>(null);

// Reference count for components using this composable
// Only dispose engine when all components unmount
let componentRefCount = 0;

// Core health state
const coreHealth = ref<HQState>({
  health: 100,
  maxHealth: 100,
  damageState: 'healthy',
});

// Time remaining in combat
const timeRemaining = ref(30 * 60); // 30 minutes in seconds

export function useCombatEngine() {
  // Track component mount/unmount for reference counting
  onMounted(() => {
    componentRefCount++;
  });

  // Computed values for UI
  const coreHealthPercent = computed(() =>
    Math.round((coreHealth.value.health / coreHealth.value.maxHealth) * 100)
  );

  const getEngine = (): CombatEngine | null => {
    return engineInstance.value ?? (engine.value ? (toRaw(engine.value) as CombatEngine) : null);
  };

  const formattedTimeRemaining = computed(() => {
    const minutes = Math.floor(timeRemaining.value / 60);
    const seconds = timeRemaining.value % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  });

  /**
   * Initialize the combat engine with a canvas element
   * Call this once when the CombatView component mounts
   */
  const initEngine = (canvas: HTMLCanvasElement): void => {
    if (engine.value) {
      console.warn('Combat engine already initialized');
      return;
    }

    try {
      engine.value = new CombatEngine(canvas, {
        antialias: true,
        preserveDrawingBuffer: true,
      });
      engineInstance.value = engine.value;
      error.value = null;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to initialize combat engine';
      error.value = message;
      console.error('Failed to initialize combat engine:', e);
    }
  };

  /**
   * Setup socket event handlers for combat
   */
  const setupSocketHandlers = (): void => {
    // Handle incoming combat state updates
    gameSocket.on('combat:state', (state: CombatState) => {
      if (state.battleId === currentBattleId.value && engine.value && isActive.value) {
        trackCombatState();
        engine.value.updateState(state);

        // Update Core health and time
        coreHealth.value = state.hq;
        timeRemaining.value = state.timeRemaining;
      }
    });

    // Handle combat setup (for reconnection)
    gameSocket.on('combat:setup', (setup: CombatSetup) => {
      if (setup.battleId === currentBattleId.value && engine.value) {
        engine.value.loadBattle(setup);
        isLoading.value = false;
      }
    });

    // Handle combat end
    gameSocket.on('combat:end', (result: CombatResult) => {
      if (result.battleId === currentBattleId.value) {
        combatResult.value = result;
        console.log('Combat ended:', result);
      }
    });

    // Handle combat errors
    gameSocket.on('combat:error', (err: CombatErrorEvent) => {
      error.value = err.message;
      console.error('Combat error:', err);
    });

    // Handle connection state
    gameSocket.on('connect', () => {
      isConnected.value = true;
      // Rejoin battle if we were in one
      if (currentBattleId.value && currentPlayerId.value) {
        gameSocket.joinCombat(currentBattleId.value, currentPlayerId.value);
        gameSocket.requestCombatState(currentBattleId.value);
      }
    });

    gameSocket.on('disconnect', () => {
      isConnected.value = false;
    });
  };

  /**
   * Cleanup socket event handlers
   */
  const cleanupSocketHandlers = (): void => {
    gameSocket.off('combat:state');
    gameSocket.off('combat:setup');
    gameSocket.off('combat:end');
    gameSocket.off('combat:error');
  };

  /**
   * Enter combat mode - load battle and start rendering
   */
  const enterCombat = (setup: CombatSetup, playerId: string): void => {
    if (!engine.value) {
      error.value = 'Combat engine not initialized';
      return;
    }

    isLoading.value = true;
    error.value = null;
    combatResult.value = null;

    // Reset Core health (will be updated from setup.hqMaxHealth)
    coreHealth.value = {
      health: setup.hqMaxHealth,
      maxHealth: setup.hqMaxHealth,
      damageState: 'healthy',
    };
    timeRemaining.value = 30 * 60; // 30 minutes

    try {
      // Start the engine first
      engine.value.start();
      currentBattleId.value = setup.battleId;
      currentPlayerId.value = playerId;
      isActive.value = true;

      // Setup socket handlers and join battle
      setupSocketHandlers();
      gameSocket.joinCombat(setup.battleId, playerId);

      // Wait for layout to complete, then resize and load battle
      requestAnimationFrame(() => {
        if (engine.value) {
          engine.value.resize();
          engine.value.loadBattle(setup);
          isLoading.value = false;
        }
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to enter combat';
      error.value = message;
      console.error('Failed to enter combat:', e);
      isLoading.value = false;
    }
  };

  /**
   * Exit combat mode - stop rendering but keep engine alive
   */
  const exitCombat = (): void => {
    if (!engine.value) return;

    // Leave socket room
    if (currentBattleId.value) {
      gameSocket.leaveCombat(currentBattleId.value);
    }

    // Cleanup socket handlers
    cleanupSocketHandlers();

    engine.value.stop();
    isActive.value = false;
    currentBattleId.value = null;
    currentPlayerId.value = null;
  };

  /**
   * Send combat input to server
   */
  const sendInput = (input: CombatInput): void => {
    if (!isActive.value || !currentBattleId.value) {
      console.warn('Cannot send input: not in combat');
      return;
    }
    trackCombatInput();
    gameSocket.sendCombatInput(input);
  };

  /**
   * Update combat state from server (called internally by socket handler)
   */
  const updateState = (state: CombatState): void => {
    if (!engine.value || !isActive.value) return;
    trackCombatState();
    engine.value.updateState(state);
  };

  /**
   * Handle combat end result (called internally by socket handler)
   */
  const handleCombatEnd = (result: CombatResult): void => {
    combatResult.value = result;
    // Keep rendering for a moment to show the result
    // The UI layer will handle showing the result modal
    console.log('Combat ended:', result);
  };

  /**
   * Camera controls
   */
  const rotateCamera = (direction: 'left' | 'right'): void => {
    engine.value?.rotateCamera(direction);
  };

  const resetCamera = (): void => {
    engine.value?.resetCamera();
  };

  // ========================================
  // Dev Tools
  // ========================================

  /**
   * Initialize a dev arena for testing without a real battle
   */
  const initDevArena = (): void => {
    engine.value?.initDevArena();
  };

  /**
   * Check if arena is initialized
   */
  const hasArena = (): boolean => {
    return engine.value?.hasArena ?? false;
  };

  /**
   * Convert screen coordinates to arena grid position
   */
  const screenToArena = (screenX: number, screenY: number): ArenaPosition | null => {
    return engine.value?.screenToArena(screenX, screenY) ?? null;
  };

  /**
   * Spawn a unit at position for dev testing
   */
  const devSpawnUnit = (
    unitDef: DbUnitDefinition,
    position: ArenaPosition,
    team: 'attacker' | 'defender'
  ): string | null => {
    return engine.value?.devSpawnUnit(unitDef, position, team) ?? null;
  };

  /**
   * Spawn a unit at exact world coordinates for dev testing (no grid snapping)
   */
  const devSpawnUnitAtWorld = (
    unitDef: DbUnitDefinition,
    worldX: number,
    worldZ: number,
    team: 'attacker' | 'defender'
  ): string | null => {
    return engine.value?.devSpawnUnitAtWorld(unitDef, worldX, worldZ, team) ?? null;
  };

  /**
   * Place a building at position for dev testing
   */
  const devPlaceBuilding = (
    buildingDef: DbBuildingDefinition,
    position: ArenaPosition,
    team: 'attacker' | 'defender'
  ): string | null => {
    return engine.value?.devPlaceBuilding(buildingDef, position, team) ?? null;
  };

  /**
   * Clear all dev-spawned entities
   */
  const devClearAll = (): void => {
    engine.value?.devClearAll();
  };

  /**
   * Get count of dev entities
   */
  const getDevEntityCount = (): { units: number; buildings: number } => {
    return engine.value?.getDevEntityCount() ?? { units: 0, buildings: 0 };
  };

  const getCombatEntitySummary = (): {
    units: { total: number; attackers: number; defenders: number; dead: number };
    buildings: { total: number };
    dev: { units: number; buildings: number };
  } => {
    return (
      engine.value?.getCombatEntitySummary() ?? {
        units: { total: 0, attackers: 0, defenders: 0, dead: 0 },
        buildings: { total: 0 },
        dev: { units: 0, buildings: 0 },
      }
    );
  };

  /**
   * Inspect a GLB model pack to list all available mesh names
   * Call from browser console: useCombatEngine().inspectModelPack('/models/buildings/turrets.glb')
   */
  const inspectModelPack = async (modelPath: string): Promise<string[]> => {
    return engine.value?.inspectModelPack(modelPath) ?? [];
  };

  /**
   * Get list of all placed buildings (for calibration dropdown)
   */
  const getPlacedBuildings = (): { id: string; name: string; hasTurret: boolean }[] => {
    return engine.value?.getPlacedBuildings() ?? [];
  };

  /**
   * Get barrel offset info for a building (for calibration UI)
   */
  const getBuildingBarrelInfo = (
    buildingId: string
  ): {
    hasTurret: boolean;
    hasBarrelLine: boolean;
  } | null => {
    return engine.value?.getBuildingBarrelInfo(buildingId) ?? null;
  };

  /**
   * Show calibration marker for a building's barrel tip
   */
  const showCalibrationMarker = (buildingId: string): boolean => {
    return engine.value?.showCalibrationMarker(buildingId) ?? false;
  };

  /**
   * Hide calibration marker
   */
  const hideCalibrationMarker = (): void => {
    engine.value?.hideCalibrationMarker();
  };

  /**
   * Fire a test laser from calibration marker
   */
  const fireCalibrationTestLaser = (): void => {
    engine.value?.fireCalibrationTestLaser();
  };

  /**
   * Get current calibration building ID
   */
  const getCalibrationBuildingId = (): string | null => {
    return engine.value?.getCalibrationBuildingId() ?? null;
  };

  // ========================================
  // Mesh Inspection & Highlighting
  // ========================================

  /**
   * Get all mesh names from a building or unit's 3D model
   */
  const getEntityMeshNames = (entityType: 'building' | 'unit', entityId: string): string[] => {
    return engine.value?.getEntityMeshNames(entityType, entityId) ?? [];
  };

  /**
   * Highlight a specific mesh with a color
   */
  const highlightEntityMesh = (
    entityType: 'building' | 'unit',
    entityId: string,
    meshName: string,
    color: { r: number; g: number; b: number }
  ): void => {
    engine.value?.highlightEntityMesh(entityType, entityId, meshName, color);
  };

  /**
   * Clear all mesh highlights and restore original materials
   */
  const clearEntityMeshHighlights = (entityType: 'building' | 'unit', entityId: string): void => {
    engine.value?.clearEntityMeshHighlights(entityType, entityId);
  };

  /**
   * Update barrel Y offset for a building or unit (runtime adjustment)
   */
  const updateEntityBarrelOffsetY = (
    entityType: 'building' | 'unit',
    entityId: string,
    offsetY: number
  ): void => {
    engine.value?.updateEntityBarrelOffsetY(entityType, entityId, offsetY);
  };

  /**
   * Set barrel mesh name for a building or unit (runtime override)
   */
  const setEntityBarrelMeshName = (
    entityType: 'building' | 'unit',
    entityId: string,
    meshName: string
  ): void => {
    engine.value?.setEntityBarrelMeshName(entityType, entityId, meshName);
  };

  // ========================================
  // Selection & Force Attack
  // ========================================

  /**
   * Select a building by ID
   */
  const selectBuilding = (buildingId: string): void => {
    engine.value?.selectBuilding(buildingId);
  };

  /**
   * Deselect the currently selected building
   */
  const deselectBuilding = (): void => {
    engine.value?.deselectBuilding();
  };

  /**
   * Clear all selection
   */
  const deselectAll = (): void => {
    engine.value?.deselectAll();
  };

  /**
   * Get the currently selected building ID
   */
  const getSelectedBuildingId = (): string | null => {
    return engine.value?.getSelectedBuildingId() ?? null;
  };

  /**
   * Force attack ground at grid position (snaps to tile center)
   */
  const forceAttackGround = (buildingId: string, position: ArenaPosition): boolean => {
    return engine.value?.forceAttackGround(buildingId, position) ?? false;
  };

  /**
   * Force attack ground at exact world coordinates (precise targeting)
   */
  const forceAttackGroundWorld = (buildingId: string, worldX: number, worldZ: number): boolean => {
    return engine.value?.forceAttackGroundWorld(buildingId, worldX, worldZ) ?? false;
  };

  /**
   * Convert screen coordinates to exact world position
   */
  const screenToWorld = (
    screenX: number,
    screenY: number
  ): { x: number; y: number; z: number } | null => {
    return engine.value?.screenToWorld(screenX, screenY) ?? null;
  };

  /**
   * Force attack a unit by ID (uses unit's actual visual position for pinpoint accuracy)
   */
  const forceAttackUnit = (buildingId: string, targetUnitId: string): boolean => {
    return engine.value?.forceAttackUnit(buildingId, targetUnitId) ?? false;
  };

  /**
   * Get a unit's current visual world position
   */
  const getUnitWorldPosition = (unitId: string): { x: number; y: number; z: number } | null => {
    return engine.value?.getUnitWorldPosition(unitId) ?? null;
  };

  /**
   * Get all unit IDs in the arena
   */
  const getAllUnitIds = (): string[] => {
    return engine.value?.getAllUnitIds() ?? [];
  };

  /**
   * Issue a kill command - turret will track and attack unit until dead
   */
  const issueKillCommand = (buildingId: string, targetUnitId: string): boolean => {
    return engine.value?.issueKillCommand(buildingId, targetUnitId) ?? false;
  };

  /**
   * Cancel a kill command
   */
  const cancelKillCommand = (buildingId: string): void => {
    engine.value?.cancelKillCommand(buildingId);
  };

  /**
   * Cancel all kill commands
   */
  const cancelAllKillCommands = (): void => {
    engine.value?.cancelAllKillCommands();
  };

  /**
   * Check if building has an active kill command
   */
  const hasKillCommand = (buildingId: string): boolean => {
    return engine.value?.hasKillCommand(buildingId) ?? false;
  };

  /**
   * Cleanup on unmount - only dispose engine when all components unmount
   */
  onUnmounted(() => {
    componentRefCount--;

    // Only perform full cleanup when the last component unmounts
    if (componentRefCount <= 0) {
      componentRefCount = 0; // Safety reset

      // Cleanup socket handlers
      cleanupSocketHandlers();

      // Leave combat if still in one
      if (currentBattleId.value) {
        gameSocket.leaveCombat(currentBattleId.value);
      }

      if (engine.value) {
        engine.value.dispose();
        engine.value = null;
        engineInstance.value = null;
      }
    }
  });

  return {
    // State (readonly to prevent external mutation)
    engine: readonly(engine),
    getEngine,
    isActive: readonly(isActive),
    isLoading: readonly(isLoading),
    isConnected: readonly(isConnected),
    currentBattleId: readonly(currentBattleId),
    combatResult: readonly(combatResult),
    error: readonly(error),

    // Core health state
    coreHealth: readonly(coreHealth),
    coreHealthPercent,
    timeRemaining: readonly(timeRemaining),
    formattedTimeRemaining,

    // Actions
    initEngine,
    enterCombat,
    exitCombat,
    sendInput,
    updateState,
    handleCombatEnd,

    // Camera
    rotateCamera,
    resetCamera,

    // Dev tools
    initDevArena,
    hasArena,
    screenToArena,
    devSpawnUnit,
    devSpawnUnitAtWorld,
    devPlaceBuilding,
    devClearAll,
    getDevEntityCount,
    getCombatEntitySummary,
    inspectModelPack,

    // Barrel calibration
    getPlacedBuildings,
    getBuildingBarrelInfo,
    showCalibrationMarker,
    hideCalibrationMarker,
    fireCalibrationTestLaser,
    getCalibrationBuildingId,

    // Mesh inspection & highlighting
    getEntityMeshNames,
    highlightEntityMesh,
    clearEntityMeshHighlights,
    updateEntityBarrelOffsetY,
    setEntityBarrelMeshName,

    // Selection & Force Attack
    selectBuilding,
    deselectBuilding,
    deselectAll,
    getSelectedBuildingId,
    forceAttackGround,
    forceAttackGroundWorld,
    screenToWorld,

    // Unit targeting
    forceAttackUnit,
    getUnitWorldPosition,
    getAllUnitIds,

    // Kill commands
    issueKillCommand,
    cancelKillCommand,
    cancelAllKillCommands,
    hasKillCommand,
  };
}
