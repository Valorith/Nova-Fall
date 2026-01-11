<script setup lang="ts">
/**
 * ModelSelectorModal - Modal for selecting 3D models from the models folder
 *
 * Features:
 * - Fetches available models from API
 * - Shows visual previews using ModelPreview component
 * - Supports pack files with multiple meshes (turret_pack.glb#TurretA)
 * - Filters by category (units/buildings)
 */

import { ref, computed, onMounted, watch } from 'vue';
import { modelsApi, type ModelFile } from '@/services/api';
import { getSelectableMeshes } from '@/utils/modelInspector';
import ModelPreview from './ModelPreview.vue';

const props = defineProps<{
  visible: boolean;
  category?: 'buildings' | 'units' | 'all';
  currentPath?: string | null;
}>();

const emit = defineEmits<{
  close: [];
  select: [path: string];
}>();

// State
const loading = ref(true);
const error = ref<string | null>(null);
const models = ref<{ buildings: ModelFile[]; units: ModelFile[] }>({
  buildings: [],
  units: [],
});

// Selection state
const selectedModel = ref<ModelFile | null>(null);
const expandedPacks = ref<Set<string>>(new Set());
const selectedMesh = ref<string | null>(null);

// Mesh inspection state (for pack files)
// Map of model path -> array of mesh names
const packMeshesMap = ref<Map<string, string[]>>(new Map());
const inspectingLoading = ref<Set<string>>(new Set());
const inspectError = ref<Map<string, string>>(new Map());

// Filter
const activeCategory = ref<'buildings' | 'units'>(
  props.category === 'units' ? 'units' : 'buildings'
);

// Computed: filtered models based on active category
const filteredModels = computed(() => {
  if (props.category === 'all') {
    return [...models.value.buildings, ...models.value.units];
  }
  return models.value[activeCategory.value];
});

// Load models from API
async function loadModels() {
  loading.value = true;
  error.value = null;

  try {
    const response = await modelsApi.getAll();
    models.value = {
      buildings: response.data.buildings,
      units: response.data.units,
    };
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load models';
    console.error('Failed to load models:', err);
  } finally {
    loading.value = false;
  }
}

// Toggle pack expansion
function togglePack(model: ModelFile) {
  if (expandedPacks.value.has(model.path)) {
    expandedPacks.value.delete(model.path);
    if (selectedModel.value?.path === model.path) {
      selectedMesh.value = null;
    }
  } else {
    expandedPacks.value.add(model.path);
    // Start inspecting to get mesh names
    inspectPack(model);
  }
}

// Inspect a pack file to discover mesh names
async function inspectPack(model: ModelFile) {
  // Already have the meshes cached
  if (packMeshesMap.value.has(model.path)) {
    return;
  }

  // Already loading
  if (inspectingLoading.value.has(model.path)) {
    return;
  }

  inspectingLoading.value.add(model.path);
  inspectError.value.delete(model.path);

  try {
    const meshNames = await getSelectableMeshes(model.path);
    packMeshesMap.value.set(model.path, meshNames);
  } catch (err) {
    console.error('Failed to inspect pack:', err);
    inspectError.value.set(model.path, err instanceof Error ? err.message : 'Failed to load');
  } finally {
    inspectingLoading.value.delete(model.path);
  }
}

// Get meshes for a specific model
function getMeshesForModel(modelPath: string): string[] {
  return packMeshesMap.value.get(modelPath) || [];
}

// Check if a model is being inspected
function isInspecting(modelPath: string): boolean {
  return inspectingLoading.value.has(modelPath);
}

// Get error for a model
function getInspectError(modelPath: string): string | undefined {
  return inspectError.value.get(modelPath);
}

// Select a model
function selectModel(model: ModelFile, meshName?: string) {
  selectedModel.value = model;
  selectedMesh.value = meshName || null;
}

// Confirm selection
function confirmSelection() {
  if (!selectedModel.value) return;

  let path = selectedModel.value.path;
  if (selectedMesh.value) {
    path = `${path}#${selectedMesh.value}`;
  }

  emit('select', path);
  emit('close');
}

// Get the display path for preview
const previewPath = computed(() => {
  if (!selectedModel.value) return null;
  if (selectedMesh.value) {
    return `${selectedModel.value.path}#${selectedMesh.value}`;
  }
  return selectedModel.value.path;
});

// Format file size
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Watch visibility to load data
watch(() => props.visible, (visible) => {
  if (visible && models.value.buildings.length === 0 && models.value.units.length === 0) {
    loadModels();
  }
});

onMounted(() => {
  if (props.visible) {
    loadModels();
  }
});
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-container">
        <!-- Header -->
        <div class="modal-header">
          <h2>Select 3D Model</h2>
          <button type="button" class="btn-close" @click="emit('close')">&times;</button>
        </div>

        <!-- Category tabs (if showing all) -->
        <div v-if="category === 'all' || !category" class="category-tabs">
          <button
            type="button"
            class="tab"
            :class="{ active: activeCategory === 'buildings' }"
            @click="activeCategory = 'buildings'"
          >
            Buildings ({{ models.buildings.length }})
          </button>
          <button
            type="button"
            class="tab"
            :class="{ active: activeCategory === 'units' }"
            @click="activeCategory = 'units'"
          >
            Units ({{ models.units.length }})
          </button>
        </div>

        <!-- Content -->
        <div class="modal-content">
          <!-- Loading -->
          <div v-if="loading" class="loading-state">
            <div class="spinner"></div>
            <p>Loading models...</p>
          </div>

          <!-- Error -->
          <div v-else-if="error" class="error-state">
            <p>{{ error }}</p>
            <button type="button" class="btn btn-primary" @click="loadModels">Retry</button>
          </div>

          <!-- Empty -->
          <div v-else-if="filteredModels.length === 0" class="empty-state">
            <p>No models found in /models/{{ activeCategory }}/</p>
            <p class="hint">Add .glb or .gltf files to the models folder</p>
          </div>

          <!-- Model grid -->
          <div v-else class="model-grid">
            <div
              v-for="model in filteredModels"
              :key="model.path"
              class="model-card"
              :class="{
                selected: selectedModel?.path === model.path && !selectedMesh,
                'is-pack': model.isPack,
                expanded: expandedPacks.has(model.path),
              }"
            >
              <!-- Main model card -->
              <div class="model-card-main" @click="selectModel(model)">
                <div class="model-preview-container">
                  <ModelPreview :model-path="model.path" :height="100" />
                </div>
                <div class="model-info">
                  <span class="model-name">{{ model.filename }}</span>
                  <span class="model-size">{{ formatSize(model.size) }}</span>
                  <span v-if="model.isPack" class="pack-badge">Pack</span>
                </div>
              </div>

              <!-- Pack indicator - click to show mesh picker -->
              <button
                v-if="model.isPack"
                type="button"
                class="btn-expand"
                @click.stop="togglePack(model)"
              >
                {{ expandedPacks.has(model.path) ? 'Close picker' : 'Pick mesh' }}
              </button>
            </div>
          </div>

          <!-- Mesh picker panel (shown when pack is expanded) -->
          <div v-if="expandedPacks.size > 0" class="mesh-picker-panel">
            <template v-for="model in filteredModels" :key="model.path">
              <div v-if="expandedPacks.has(model.path)" class="mesh-picker-section">
                <div class="mesh-picker-header">
                  <span class="mesh-picker-title">{{ model.filename }}</span>
                  <span v-if="!isInspecting(model.path) && getMeshesForModel(model.path).length > 0" class="mesh-count">
                    {{ getMeshesForModel(model.path).length }} meshes
                  </span>
                  <button type="button" class="btn-close-picker" @click="togglePack(model)">&times;</button>
                </div>

                <!-- Loading state -->
                <div v-if="isInspecting(model.path)" class="mesh-picker-loading">
                  <div class="mini-spinner"></div>
                  <span>Scanning...</span>
                </div>

                <!-- Error state -->
                <div v-else-if="getInspectError(model.path)" class="mesh-picker-error">
                  {{ getInspectError(model.path) }}
                </div>

                <!-- Empty state -->
                <div v-else-if="getMeshesForModel(model.path).length === 0" class="mesh-picker-empty">
                  No selectable meshes found
                </div>

                <!-- Mesh grid -->
                <div v-else class="mesh-picker-grid">
                  <div
                    v-for="meshName in getMeshesForModel(model.path)"
                    :key="meshName"
                    class="mesh-picker-item"
                    :class="{ selected: selectedModel?.path === model.path && selectedMesh === meshName }"
                    @click="selectModel(model, meshName)"
                  >
                    <div class="mesh-preview-thumb">
                      <ModelPreview :model-path="`${model.path}#${meshName}`" :height="60" />
                    </div>
                    <span class="mesh-picker-name">{{ meshName }}</span>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- Preview pane -->
        <div v-if="selectedModel" class="preview-pane">
          <div class="preview-header">
            <span>Preview</span>
            <span class="preview-path">{{ previewPath }}</span>
          </div>
          <div class="preview-container">
            <ModelPreview :model-path="previewPath" :height="250" />
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <div class="selected-info">
            <template v-if="selectedModel">
              Selected: <strong>{{ previewPath }}</strong>
            </template>
            <template v-else>
              <span class="hint">Click a model to select it</span>
            </template>
          </div>
          <div class="footer-actions">
            <button type="button" class="btn btn-secondary" @click="emit('close')">
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="!selectedModel"
              @click="confirmSelection"
            >
              Select Model
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
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  width: 90%;
  max-width: 900px;
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
  font-size: 18px;
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

/* Category tabs */
.category-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 20px;
  background: #151a24;
  border-bottom: 1px solid #2a3040;
}

.tab {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #6b7280;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.tab:hover {
  color: #e5e5e5;
  background: #1a1f2e;
}

.tab.active {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
}

/* Content */
.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: #6b7280;
  text-align: center;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #2a3040;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.hint {
  font-size: 12px;
  color: #4b5563;
}

/* Model grid */
.model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.model-card {
  background: #1a1f2e;
  border: 2px solid transparent;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s;
}

.model-card:hover {
  border-color: #3b82f6;
}

.model-card.selected {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.1);
}

.model-card.is-pack {
  border-style: dashed;
}

.model-card-main {
  padding: 12px;
}

.model-preview-container {
  width: 100%;
  height: 100px;
  background: #0a0d12;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 10px;
}

.model-info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.model-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: #e5e5e5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-size {
  font-size: 11px;
  color: #6b7280;
}

.pack-badge {
  font-size: 9px;
  font-weight: 600;
  padding: 2px 6px;
  background: rgba(168, 85, 247, 0.2);
  color: #a855f7;
  border-radius: 4px;
}

.btn-expand {
  width: 100%;
  padding: 8px;
  background: #151a24;
  border: none;
  border-top: 1px solid #2a3040;
  color: #9ca3af;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-expand:hover {
  background: #1a1f2e;
  color: #e5e5e5;
}

/* Mesh picker panel - horizontal scrollable grid */
.mesh-picker-panel {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #2a3040;
}

.mesh-picker-section {
  background: #151a24;
  border: 1px solid #2a3040;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 12px;
}

.mesh-picker-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a3040;
}

.mesh-picker-title {
  font-size: 13px;
  font-weight: 500;
  color: #e5e5e5;
}

.mesh-count {
  font-size: 11px;
  color: #6b7280;
  margin-left: auto;
}

.btn-close-picker {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #6b7280;
  font-size: 18px;
  cursor: pointer;
  border-radius: 4px;
}

.btn-close-picker:hover {
  background: #2a3040;
  color: #e5e5e5;
}

.mesh-picker-loading,
.mesh-picker-error,
.mesh-picker-empty {
  padding: 16px;
  font-size: 12px;
  color: #6b7280;
  text-align: center;
}

.mesh-picker-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.mesh-picker-error {
  color: #f87171;
}

.mini-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #2a3040;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.mesh-picker-grid {
  display: flex;
  gap: 8px;
  padding: 12px;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: #374151 #0a0d12;
}

.mesh-picker-grid::-webkit-scrollbar {
  height: 6px;
}

.mesh-picker-grid::-webkit-scrollbar-track {
  background: #0a0d12;
  border-radius: 3px;
}

.mesh-picker-grid::-webkit-scrollbar-thumb {
  background: #374151;
  border-radius: 3px;
}

.mesh-picker-grid::-webkit-scrollbar-thumb:hover {
  background: #4b5563;
}

.mesh-picker-item {
  flex-shrink: 0;
  width: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px;
  background: #1a1f2e;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.mesh-picker-item:hover {
  border-color: #3b82f6;
  background: #232938;
}

.mesh-picker-item.selected {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.15);
}

.mesh-preview-thumb {
  width: 60px;
  height: 60px;
  background: #0a0d12;
  border-radius: 4px;
  overflow: hidden;
}

.mesh-picker-name {
  font-size: 9px;
  font-family: monospace;
  color: #9ca3af;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

/* Preview pane */
.preview-pane {
  padding: 16px 20px;
  background: #151a24;
  border-top: 1px solid #2a3040;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 13px;
  color: #9ca3af;
}

.preview-path {
  font-family: monospace;
  font-size: 11px;
  color: #6b7280;
}

.preview-container {
  background: #0a0d12;
  border-radius: 8px;
  overflow: hidden;
  max-width: 250px;
  aspect-ratio: 1;
  margin: 0 auto;
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

.selected-info {
  font-size: 13px;
  color: #9ca3af;
}

.selected-info strong {
  color: #22c55e;
  font-family: monospace;
}

.footer-actions {
  display: flex;
  gap: 12px;
}

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
</style>
