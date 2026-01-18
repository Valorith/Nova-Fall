<script setup lang="ts">
/**
 * BarrelCalibrationModal - Modal for calibrating turret/tank barrel settings
 *
 * Features:
 * - Lists all mesh parts from the 3D model
 * - Allows selecting which mesh is the barrel
 * - Y offset slider for fine-tuning barrel position
 * - Test fire to verify alignment
 * - Saves barrelMeshName and barrelOffsetY to definition
 */

import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { buildingsApi, unitsApi } from '@/services/api';
import { useCombatEngine } from '@/composables/useCombatEngine';
import type { DbBuildingDefinition, DbUnitDefinition } from '@nova-fall/shared';

const props = defineProps<{
  visible: boolean;
  entityType: 'building' | 'unit';
  entityId: string; // Placed entity ID in combat
  definition: DbBuildingDefinition | DbUnitDefinition;
}>();

const emit = defineEmits<{
  close: [];
  saved: [barrelMeshName: string | null, barrelOffsetY: number];
}>();

// Get combat engine methods
const {
  getEntityMeshNames,
  highlightEntityMesh,
  clearEntityMeshHighlights,
  updateEntityBarrelOffsetY,
  fireCalibrationTestLaser,
  showCalibrationMarker,
  hideCalibrationMarker,
} = useCombatEngine();

// State
const meshNames = ref<string[]>([]);
const selectedMeshName = ref<string | null>(null);
const hoveredMeshName = ref<string | null>(null);
const offsetY = ref(0);
const saving = ref(false);
const loading = ref(true);

// Colors for highlighting
const COLOR_SELECTED = { r: 0.13, g: 0.77, b: 0.37 }; // Green #22c55e
const COLOR_HOVERED = { r: 0.23, g: 0.51, b: 0.96 }; // Blue #3b82f6
const COLOR_DEFAULT = { r: 0.5, g: 0.5, b: 0.5 }; // Gray

// Get current barrelOffsetY from definition
function getDefinitionBarrelOffsetY(): number {
  if (props.entityType === 'building') {
    return (props.definition as DbBuildingDefinition).barrelOffsetY ?? 0;
  } else {
    return (props.definition as DbUnitDefinition).barrelOffsetY ?? 0;
  }
}

// Get current barrelMeshName from definition
function getDefinitionBarrelMeshName(): string | null {
  if (props.entityType === 'building') {
    return (props.definition as DbBuildingDefinition).barrelMeshName ?? null;
  } else {
    return (props.definition as DbUnitDefinition).barrelMeshName ?? null;
  }
}

// Load mesh names when modal opens
function loadMeshNames() {
  loading.value = true;
  try {
    meshNames.value = getEntityMeshNames(props.entityType, props.entityId);
    // Initialize from definition
    selectedMeshName.value = getDefinitionBarrelMeshName();
    offsetY.value = getDefinitionBarrelOffsetY();
  } catch (err) {
    console.error('Failed to load mesh names:', err);
    meshNames.value = [];
  } finally {
    loading.value = false;
  }
}

// Update mesh highlighting based on selection state
function updateHighlighting() {
  if (!props.visible) return;

  // Clear all highlights first
  clearEntityMeshHighlights(props.entityType, props.entityId);

  // Apply highlights based on state
  for (const meshName of meshNames.value) {
    if (meshName === selectedMeshName.value) {
      highlightEntityMesh(props.entityType, props.entityId, meshName, COLOR_SELECTED);
    } else if (meshName === hoveredMeshName.value) {
      highlightEntityMesh(props.entityType, props.entityId, meshName, COLOR_HOVERED);
    } else {
      highlightEntityMesh(props.entityType, props.entityId, meshName, COLOR_DEFAULT);
    }
  }
}

// Handle mesh selection
function selectMesh(meshName: string) {
  if (selectedMeshName.value === meshName) {
    selectedMeshName.value = null;
  } else {
    selectedMeshName.value = meshName;
  }
  updateHighlighting();
}

// Handle mesh hover
function hoverMesh(meshName: string | null) {
  hoveredMeshName.value = meshName;
  updateHighlighting();
}

// Update offset and apply in real-time
function updateOffset(newOffset: number) {
  offsetY.value = newOffset;
  updateEntityBarrelOffsetY(props.entityType, props.entityId, newOffset);
}

// Fire test projectile
function handleTestFire() {
  fireCalibrationTestLaser();
}

// Save calibration to API
async function handleSave() {
  saving.value = true;
  try {
    const data = {
      barrelMeshName: selectedMeshName.value,
      barrelOffsetY: offsetY.value,
    };

    if (props.entityType === 'building') {
      await buildingsApi.update(props.definition.id, data);
    } else {
      await unitsApi.update(props.definition.id, data);
    }

    emit('saved', selectedMeshName.value, offsetY.value);
    emit('close');
  } catch (err) {
    console.error('Failed to save calibration:', err);
    alert('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'));
  } finally {
    saving.value = false;
  }
}

// Handle close
function handleClose() {
  clearEntityMeshHighlights(props.entityType, props.entityId);
  hideCalibrationMarker();
  emit('close');
}

// Handle escape key
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    handleClose();
  }
}

// Watch visibility
watch(() => props.visible, (visible) => {
  if (visible) {
    loadMeshNames();
    showCalibrationMarker(props.entityId);
    updateHighlighting();
  } else {
    clearEntityMeshHighlights(props.entityType, props.entityId);
    hideCalibrationMarker();
  }
});

// Watch selection changes
watch(selectedMeshName, updateHighlighting);

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  if (props.visible) {
    loadMeshNames();
    showCalibrationMarker(props.entityId);
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});

// Computed: entity type label
const entityTypeLabel = computed(() => props.entityType === 'building' ? 'Turret' : 'Unit');
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="handleClose">
      <div class="modal-container">
        <!-- Header -->
        <div class="modal-header">
          <h2>Barrel Calibration - {{ definition.name }}</h2>
          <button type="button" class="btn-close" @click="handleClose">&times;</button>
        </div>

        <!-- Content -->
        <div class="modal-content">
          <div class="content-layout">
            <!-- Left: Mesh list -->
            <div class="mesh-panel">
              <div class="panel-header">
                <span class="panel-title">Model Parts</span>
                <span class="mesh-count">{{ meshNames.length }} meshes</span>
              </div>

              <div v-if="loading" class="loading">
                Loading mesh data...
              </div>

              <div v-else-if="meshNames.length === 0" class="empty">
                No meshes found in model
              </div>

              <div v-else class="mesh-list">
                <button
                  v-for="meshName in meshNames"
                  :key="meshName"
                  type="button"
                  class="mesh-item"
                  :class="{
                    selected: selectedMeshName === meshName,
                    hovered: hoveredMeshName === meshName,
                  }"
                  @click="selectMesh(meshName)"
                  @mouseenter="hoverMesh(meshName)"
                  @mouseleave="hoverMesh(null)"
                >
                  <span class="mesh-indicator" :class="{ active: selectedMeshName === meshName }"></span>
                  <span class="mesh-name">{{ meshName }}</span>
                  <span v-if="selectedMeshName === meshName" class="barrel-badge">BARREL</span>
                </button>
              </div>

              <div class="mesh-hint">
                Click a mesh to set it as the barrel
              </div>
            </div>

            <!-- Right: Controls -->
            <div class="controls-panel">
              <!-- Selected barrel info -->
              <div class="control-section">
                <div class="section-header">Selected Barrel</div>
                <div v-if="selectedMeshName" class="selected-barrel">
                  <span class="barrel-name">{{ selectedMeshName }}</span>
                  <button type="button" class="btn-clear" @click="selectedMeshName = null">Clear</button>
                </div>
                <div v-else class="no-selection">
                  No barrel selected (auto-detect)
                </div>
              </div>

              <!-- Y Offset slider -->
              <div class="control-section">
                <div class="section-header">Barrel Y Offset</div>
                <div class="offset-controls">
                  <input
                    type="range"
                    class="offset-slider"
                    :value="offsetY"
                    min="-10"
                    max="10"
                    step="0.01"
                    @input="(e) => updateOffset(parseFloat((e.target as HTMLInputElement).value))"
                  />
                  <input
                    type="number"
                    class="offset-input"
                    :value="offsetY.toFixed(3)"
                    step="0.01"
                    @input="(e) => updateOffset(parseFloat((e.target as HTMLInputElement).value) || 0)"
                  />
                </div>
                <div class="offset-hint">
                  Negative = down, Positive = up
                </div>
              </div>

              <!-- Test fire -->
              <div class="control-section">
                <div class="section-header">Test Alignment</div>
                <button type="button" class="btn-test" @click="handleTestFire">
                  Test Fire
                </button>
                <div class="test-hint">
                  Fire a test projectile to verify barrel alignment
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <div class="footer-info">
            {{ entityTypeLabel }}: {{ definition.name }}
          </div>
          <div class="footer-actions">
            <button type="button" class="btn btn-secondary" @click="handleClose">
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="saving"
              @click="handleSave"
            >
              {{ saving ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  width: 90%;
  max-width: 700px;
  max-height: 85vh;
  background: #0f1419;
  border: 1px solid #2a3040;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a3040;
}

.modal-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #e5e5e5;
}

.btn-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #6b7280;
  font-size: 24px;
  cursor: pointer;
  border-radius: 6px;
}

.btn-close:hover {
  background: #2a3040;
  color: #e5e5e5;
}

/* Content */
.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.content-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

/* Mesh Panel */
.mesh-panel {
  background: #151a24;
  border: 1px solid #2a3040;
  border-radius: 8px;
  padding: 16px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #2a3040;
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: #e5e5e5;
}

.mesh-count {
  font-size: 11px;
  color: #6b7280;
}

.loading,
.empty {
  padding: 24px;
  text-align: center;
  color: #6b7280;
  font-size: 13px;
}

.mesh-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.mesh-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #1a1f2e;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.mesh-item:hover {
  background: #232938;
  border-color: #3b82f6;
}

.mesh-item.selected {
  background: rgba(34, 197, 94, 0.15);
  border-color: #22c55e;
}

.mesh-item.hovered:not(.selected) {
  border-color: #3b82f6;
}

.mesh-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #4b5563;
  flex-shrink: 0;
}

.mesh-indicator.active {
  background: #22c55e;
}

.mesh-name {
  flex: 1;
  font-size: 12px;
  color: #e5e5e5;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.barrel-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
  border-radius: 4px;
}

.mesh-hint {
  margin-top: 12px;
  font-size: 11px;
  color: #6b7280;
  text-align: center;
}

/* Controls Panel */
.controls-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.control-section {
  background: #151a24;
  border: 1px solid #2a3040;
  border-radius: 8px;
  padding: 16px;
}

.section-header {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  margin-bottom: 12px;
}

.selected-barrel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.barrel-name {
  font-size: 13px;
  font-weight: 500;
  color: #22c55e;
  font-family: monospace;
}

.btn-clear {
  padding: 4px 8px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 4px;
  color: #f87171;
  font-size: 11px;
  cursor: pointer;
}

.btn-clear:hover {
  background: rgba(239, 68, 68, 0.25);
}

.no-selection {
  font-size: 13px;
  color: #6b7280;
  font-style: italic;
}

/* Offset controls */
.offset-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.offset-slider {
  flex: 1;
  height: 6px;
  appearance: none;
  background: #1a1f2e;
  border-radius: 3px;
  cursor: pointer;
}

.offset-slider::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  background: #f97316;
  border-radius: 50%;
  cursor: grab;
}

.offset-slider::-webkit-slider-thumb:active {
  cursor: grabbing;
}

.offset-input {
  width: 80px;
  padding: 6px 8px;
  background: #1a1f2e;
  border: 1px solid #2a3040;
  border-radius: 4px;
  color: #e5e5e5;
  font-size: 12px;
  font-family: monospace;
  text-align: right;
}

.offset-input:focus {
  outline: none;
  border-color: #f97316;
}

.offset-hint {
  margin-top: 8px;
  font-size: 11px;
  color: #6b7280;
}

/* Test fire */
.btn-test {
  width: 100%;
  padding: 10px 16px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-test:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.test-hint {
  margin-top: 8px;
  font-size: 11px;
  color: #6b7280;
  text-align: center;
}

/* Footer */
.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #1a1f2e;
  border-top: 1px solid #2a3040;
}

.footer-info {
  font-size: 12px;
  color: #6b7280;
}

.footer-actions {
  display: flex;
  gap: 12px;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #22c55e;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #16a34a;
}

.btn-secondary {
  background: #374151;
  color: #e5e5e5;
}

.btn-secondary:hover:not(:disabled) {
  background: #4b5563;
}
</style>
