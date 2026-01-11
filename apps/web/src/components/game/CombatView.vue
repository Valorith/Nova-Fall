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

import { ref, onMounted, defineExpose } from 'vue';
import { useCombatEngine } from '../../composables/useCombatEngine';
import type { CombatResult } from '@nova-fall/shared';

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
  error,
  currentBattleId,
  initEngine,
  enterCombat,
  exitCombat,
  updateState,
  handleCombatEnd,
  rotateCamera,
  resetCamera,
} = useCombatEngine();

// Canvas reference
const canvasRef = ref<HTMLCanvasElement | null>(null);

// Initialize engine when mounted
onMounted(() => {
  if (canvasRef.value) {
    initEngine(canvasRef.value);
  }
});

// Expose methods for parent component
defineExpose({
  enterCombat,
  exitCombat,
  updateState,
  handleCombatEnd,
  isActive,
  currentBattleId,
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
    <canvas ref="canvasRef" class="combat-canvas" />

    <!-- Loading Overlay -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner" />
      <p>Loading Battle Arena...</p>
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
          <span class="timer-label">Time Remaining</span>
          <span class="timer-value">30:00</span>
        </div>
        <div class="hq-health">
          <span class="hq-label">HQ Health</span>
          <div class="hq-bar">
            <div class="hq-bar-fill" style="width: 100%" />
          </div>
        </div>
      </div>

      <!-- Camera Controls -->
      <div class="camera-controls">
        <button class="btn-icon" @click="handleRotateLeft" title="Rotate Left (Q)">
          &#8634;
        </button>
        <button class="btn-icon" @click="resetCamera" title="Reset Camera">
          &#8962;
        </button>
        <button class="btn-icon" @click="handleRotateRight" title="Rotate Right (E)">
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
  width: 100%;
  height: 100%;
  display: block;
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
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.7);
  padding: 12px 24px;
  border-radius: 8px;
  border: 1px solid #333;
}

.timer {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.timer-label {
  font-size: 0.75rem;
  color: #888;
  text-transform: uppercase;
}

.timer-value {
  font-size: 2rem;
  font-weight: bold;
  color: #fff;
  font-variant-numeric: tabular-nums;
}

.hq-health {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 200px;
}

.hq-label {
  font-size: 0.75rem;
  color: #888;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.hq-bar {
  width: 100%;
  height: 12px;
  background: #1a1a24;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #333;
}

.hq-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #8bc34a);
  transition: width 0.3s ease;
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
