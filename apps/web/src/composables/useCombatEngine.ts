/**
 * useCombatEngine - Vue composable for managing the Babylon.js combat engine
 *
 * This composable handles:
 * - Engine lifecycle (init, start, stop, dispose)
 * - Combat state management
 * - View switching between tactical map and combat mode
 */

import { ref, shallowRef, onUnmounted, readonly } from 'vue';
import { CombatEngine } from '../game/combat';
import type { CombatSetup, CombatState, CombatResult } from '@nova-fall/shared';

export function useCombatEngine() {
  // Use shallowRef for the engine instance to avoid deep reactivity on Babylon objects
  const engine = shallowRef<CombatEngine | null>(null);
  const isActive = ref(false);
  const isLoading = ref(false);
  const currentBattleId = ref<string | null>(null);
  const error = ref<string | null>(null);

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
      error.value = null;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to initialize combat engine';
      error.value = message;
      console.error('Failed to initialize combat engine:', e);
    }
  };

  /**
   * Enter combat mode - load battle and start rendering
   */
  const enterCombat = (setup: CombatSetup): void => {
    if (!engine.value) {
      error.value = 'Combat engine not initialized';
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      // Start the engine first
      engine.value.start();
      currentBattleId.value = setup.battleId;
      isActive.value = true;

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

    engine.value.stop();
    isActive.value = false;
    currentBattleId.value = null;
  };

  /**
   * Update combat state from server
   */
  const updateState = (state: CombatState): void => {
    if (!engine.value || !isActive.value) return;
    engine.value.updateState(state);
  };

  /**
   * Handle combat end result
   */
  const handleCombatEnd = (result: CombatResult): void => {
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

  /**
   * Cleanup on unmount
   */
  onUnmounted(() => {
    if (engine.value) {
      engine.value.dispose();
      engine.value = null;
    }
  });

  return {
    // State (readonly to prevent external mutation)
    engine: readonly(engine),
    isActive: readonly(isActive),
    isLoading: readonly(isLoading),
    currentBattleId: readonly(currentBattleId),
    error: readonly(error),

    // Actions
    initEngine,
    enterCombat,
    exitCombat,
    updateState,
    handleCombatEnd,

    // Camera
    rotateCamera,
    resetCamera,
  };
}
