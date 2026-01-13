<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { aiPresetsApi } from '@/services/api';
import type { DbAIPreset } from '@nova-fall/shared';

interface Props {
  modelValue: string | null;
  category: 'unit' | 'building';
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void;
  (e: 'edit', presetId: string): void;
}>();

// State
const presets = ref<DbAIPreset[]>([]);
const loading = ref(false);
const showDropdown = ref(false);
const searchQuery = ref('');

// Current selected preset
const selectedPreset = computed(() => {
  if (!props.modelValue) return null;
  return presets.value.find((p) => p.id === props.modelValue) || null;
});

// Filtered presets for dropdown
const filteredPresets = computed(() => {
  let filtered = presets.value.filter((p) => p.category === props.category);
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(
      (p) => p.name.toLowerCase().includes(query) || (p.description?.toLowerCase().includes(query) ?? false)
    );
  }
  return filtered;
});

// Fetch presets
async function fetchPresets() {
  loading.value = true;
  try {
    const response = await aiPresetsApi.getAll({
      category: props.category,
      includeTemplates: true,
      limit: 100,
    });
    presets.value = response.data.presets;
  } catch (err) {
    console.error('Failed to load AI presets:', err);
  } finally {
    loading.value = false;
  }
}

// Select a preset
function selectPreset(preset: DbAIPreset) {
  emit('update:modelValue', preset.id);
  showDropdown.value = false;
  searchQuery.value = '';
}

// Clear selection
function clearSelection() {
  emit('update:modelValue', null);
  showDropdown.value = false;
}

// Open dropdown
function openDropdown() {
  if (props.disabled) return;
  showDropdown.value = true;
}

// Close dropdown
function closeDropdown() {
  showDropdown.value = false;
  searchQuery.value = '';
}

// Edit preset (navigate to AI editor)
function editPreset() {
  if (selectedPreset.value) {
    emit('edit', selectedPreset.value.id);
  }
}

// Handle click outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.closest('.ai-preset-selector')) {
    closeDropdown();
  }
}

// Watch category changes and refetch
watch(() => props.category, fetchPresets);

onMounted(() => {
  fetchPresets();
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div class="ai-preset-selector">
    <!-- Current selection / Button to open -->
    <div v-if="!showDropdown" class="selector-display" @click="openDropdown">
      <div v-if="selectedPreset" class="selected-preset">
        <div class="preset-info">
          <span class="preset-name">{{ selectedPreset.name }}</span>
          <span v-if="selectedPreset.isTemplate" class="template-badge">T</span>
        </div>
        <div class="preset-actions">
          <button
            type="button"
            class="btn-edit"
            title="Edit in AI Editor"
            @click.stop="editPreset"
          >
            Edit
          </button>
          <button
            type="button"
            class="btn-clear"
            title="Remove AI preset"
            :disabled="disabled"
            @click.stop="clearSelection"
          >
            &times;
          </button>
        </div>
      </div>
      <div v-else class="no-preset">
        <span class="placeholder">Select AI Behavior...</span>
        <span class="dropdown-arrow">&#9662;</span>
      </div>
    </div>

    <!-- Dropdown -->
    <div v-if="showDropdown" class="selector-dropdown">
      <div class="dropdown-header">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search presets..."
          class="search-input"
          autofocus
        />
        <button type="button" class="btn-close" @click="closeDropdown">&times;</button>
      </div>

      <div class="dropdown-list">
        <div v-if="loading" class="dropdown-loading">Loading presets...</div>
        <div v-else-if="filteredPresets.length === 0" class="dropdown-empty">
          No AI presets found for this category
        </div>
        <div
          v-for="preset in filteredPresets"
          :key="preset.id"
          class="dropdown-item"
          :class="{ selected: preset.id === modelValue }"
          @click="selectPreset(preset)"
        >
          <div class="item-info">
            <span class="item-name">{{ preset.name }}</span>
            <span v-if="preset.isTemplate" class="template-badge">Template</span>
          </div>
          <p v-if="preset.description" class="item-description">{{ preset.description }}</p>
        </div>
      </div>

      <div class="dropdown-footer">
        <button v-if="modelValue" type="button" class="btn-remove" @click="clearSelection">
          Remove AI Preset
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-preset-selector {
  position: relative;
  width: 100%;
}

.selector-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #0a0d12;
  border: 1px solid #2a3040;
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.15s;
}

.selector-display:hover {
  border-color: #3b82f6;
}

.selected-preset {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.preset-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preset-name {
  font-size: 14px;
  color: #e5e5e5;
}

.template-badge {
  font-size: 9px;
  padding: 2px 6px;
  background: rgba(234, 179, 8, 0.2);
  color: #eab308;
  border-radius: 3px;
  font-weight: 600;
}

.preset-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-edit {
  padding: 4px 10px;
  background: #374151;
  border: none;
  border-radius: 4px;
  color: #9ca3af;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-edit:hover {
  background: #4b5563;
  color: #e5e5e5;
}

.btn-clear {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.15);
  border: none;
  border-radius: 4px;
  color: #f87171;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-clear:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.3);
}

.btn-clear:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.no-preset {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.placeholder {
  color: #6b7280;
  font-size: 14px;
}

.dropdown-arrow {
  color: #6b7280;
  font-size: 10px;
}

/* Dropdown */
.selector-dropdown {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background: #1a1f2e;
  border: 1px solid #3b82f6;
  border-radius: 6px;
  z-index: 100;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
}

.dropdown-header {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid #2a3040;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  background: #0a0d12;
  border: 1px solid #2a3040;
  border-radius: 4px;
  color: #e5e5e5;
  font-size: 13px;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.btn-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #374151;
  border: none;
  border-radius: 4px;
  color: #9ca3af;
  font-size: 16px;
  cursor: pointer;
}

.btn-close:hover {
  background: #4b5563;
  color: #e5e5e5;
}

.dropdown-list {
  max-height: 250px;
  overflow-y: auto;
}

.dropdown-loading,
.dropdown-empty {
  padding: 20px;
  text-align: center;
  color: #6b7280;
  font-size: 13px;
}

.dropdown-item {
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

.dropdown-item.selected {
  background: rgba(59, 130, 246, 0.15);
}

.item-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-name {
  font-size: 14px;
  font-weight: 500;
  color: #e5e5e5;
}

.item-description {
  margin: 4px 0 0 0;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.4;
}

.dropdown-footer {
  padding: 8px;
  border-top: 1px solid #2a3040;
}

.btn-remove {
  width: 100%;
  padding: 8px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 4px;
  color: #f87171;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-remove:hover {
  background: rgba(239, 68, 68, 0.25);
}
</style>
