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
import CombatDevPanel from './CombatDevPanel.vue';
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
  isConnected,
  error,
  currentBattleId,
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
} = useCombatEngine();

// Canvas reference
const canvasRef = ref<HTMLCanvasElement | null>(null);

// Dev panel state
const showDevPanel = ref(true); // Show by default in dev mode
const devPanelRef = ref<InstanceType<typeof CombatDevPanel> | null>(null);
const isPlacementMode = ref(false);

// Handle placement mode change from dev panel
const handlePlacementModeChange = (active: boolean) => {
  isPlacementMode.value = active;
};

// Handle canvas click - forward to dev panel if in placement mode
const handleCanvasClick = (event: MouseEvent) => {
  if (isPlacementMode.value && devPanelRef.value) {
    devPanelRef.value.handleArenaClick(event);
  }
};

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
      :class="{ 'placement-mode': isPlacementMode }"
      @click="handleCanvasClick"
    />

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

    <!-- Dev Panel -->
    <CombatDevPanel
      ref="devPanelRef"
      :visible="showDevPanel"
      @close="showDevPanel = false"
      @placement-mode-change="handlePlacementModeChange"
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
  width: 100%;
  height: 100%;
  display: block;
}

.combat-canvas.placement-mode {
  cursor: crosshair;
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
