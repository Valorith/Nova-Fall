<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { settingsApi, type NodeIconsMap } from '@/services/api';
import IconPicker from './IconPicker.vue';
import { NodeType, NODE_TYPE_CONFIGS } from '@nova-fall/shared';

// State
const loading = ref(false);
const saving = ref<string | null>(null);
const error = ref<string | null>(null);
const nodeIcons = ref<NodeIconsMap>({});
const showIconPicker = ref(false);
const editingNodeType = ref<string | null>(null);
const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Get all node types for display
const nodeTypes = Object.values(NodeType);

// Load node icons on mount
async function loadNodeIcons() {
  loading.value = true;
  error.value = null;
  try {
    const response = await settingsApi.getNodeIcons();
    nodeIcons.value = response.data.data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load settings';
    console.error('Failed to load node icons:', err);
  } finally {
    loading.value = false;
  }
}

// Get node type display name
function getNodeDisplayName(nodeType: NodeType): string {
  return NODE_TYPE_CONFIGS[nodeType]?.displayName || nodeType.replace(/_/g, ' ');
}

// Get node type color
function getNodeColor(nodeType: NodeType): string {
  return NODE_TYPE_CONFIGS[nodeType]?.color || '#888888';
}

// Get current icon for a node type
function getCurrentIcon(nodeType: string): string {
  return nodeIcons.value[nodeType] || getDefaultEmoji(nodeType);
}

// Get default emoji for node type
function getDefaultEmoji(nodeType: string): string {
  const defaults: Record<string, string> = {
    [NodeType.MINING]: '⛏️',
    [NodeType.REFINERY]: '🏭',
    [NodeType.RESEARCH]: '🔬',
    [NodeType.TRADE_HUB]: '💰',
    [NodeType.BARRACKS]: '⚔️',
    [NodeType.AGRICULTURAL]: '🌾',
    [NodeType.POWER_PLANT]: '⚡',
    [NodeType.MANUFACTURING_PLANT]: '🔧',
    [NodeType.CAPITAL]: '🏛️',
    [NodeType.CROWN]: '👑',
  };
  return defaults[nodeType] || '📍';
}

// Check if icon is a URL
function isIconUrl(icon: string): boolean {
  return icon.startsWith('/') || icon.startsWith('http');
}

// Get full icon URL
function getIconUrl(icon: string): string {
  if (icon.startsWith('http')) return icon;
  return `${apiBaseUrl}${icon}`;
}

// Open icon picker for a node type
function openIconPicker(nodeType: string) {
  editingNodeType.value = nodeType;
  showIconPicker.value = true;
}

// Handle icon selection from picker
async function handleIconSelected(iconPath: string) {
  if (!editingNodeType.value) return;

  saving.value = editingNodeType.value;
  error.value = null;

  try {
    await settingsApi.setNodeIcon(editingNodeType.value, iconPath);
    nodeIcons.value[editingNodeType.value] = iconPath;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save icon';
    console.error('Failed to save node icon:', err);
  } finally {
    saving.value = null;
    editingNodeType.value = null;
  }
}

// Set emoji icon for a node type
async function setEmojiIcon(nodeType: string, emoji: string) {
  if (!emoji) return;

  saving.value = nodeType;
  error.value = null;

  try {
    await settingsApi.setNodeIcon(nodeType, emoji);
    nodeIcons.value[nodeType] = emoji;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save icon';
    console.error('Failed to save node icon:', err);
  } finally {
    saving.value = null;
  }
}

// Reset icon for a single node type
async function resetIcon(nodeType: string) {
  saving.value = nodeType;
  error.value = null;

  try {
    // Set to default emoji
    const defaultEmoji = getDefaultEmoji(nodeType);
    await settingsApi.setNodeIcon(nodeType, defaultEmoji);
    nodeIcons.value[nodeType] = defaultEmoji;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to reset icon';
    console.error('Failed to reset node icon:', err);
  } finally {
    saving.value = null;
  }
}

// Reset all icons to defaults
async function resetAllIcons() {
  if (!confirm('Are you sure you want to reset all node icons to defaults?')) return;

  loading.value = true;
  error.value = null;

  try {
    const response = await settingsApi.resetNodeIcons();
    nodeIcons.value = response.data.data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to reset icons';
    console.error('Failed to reset node icons:', err);
  } finally {
    loading.value = false;
  }
}

onMounted(loadNodeIcons);
</script>

<template>
  <div class="settings-editor">
    <div class="editor-header">
      <h2>Game Settings</h2>
    </div>

    <!-- Error Banner -->
    <div v-if="error" class="error-banner">
      <span>{{ error }}</span>
      <button @click="error = null">&times;</button>
    </div>

    <div class="editor-content">
      <!-- Node Icons Section -->
      <section class="settings-section">
        <div class="section-header">
          <div class="section-title">
            <h3>Node Type Icons</h3>
            <p class="section-description">Customize the icons displayed for each node type on the map</p>
          </div>
          <button
            class="btn btn-secondary"
            :disabled="loading"
            @click="resetAllIcons"
          >
            Reset All to Default
          </button>
        </div>

        <div v-if="loading" class="loading">Loading settings...</div>

        <div v-else class="node-icons-grid">
          <div
            v-for="nodeType in nodeTypes"
            :key="nodeType"
            class="node-icon-card"
          >
            <div class="node-icon-header">
              <span
                class="node-color-dot"
                :style="{ backgroundColor: getNodeColor(nodeType) }"
              ></span>
              <span class="node-type-name">{{ getNodeDisplayName(nodeType) }}</span>
            </div>

            <div class="node-icon-preview">
              <div
                class="icon-display"
                :style="{ borderColor: getNodeColor(nodeType) }"
              >
                <img
                  v-if="isIconUrl(getCurrentIcon(nodeType))"
                  :src="getIconUrl(getCurrentIcon(nodeType))"
                  alt=""
                  class="icon-image"
                />
                <span v-else class="icon-emoji">{{ getCurrentIcon(nodeType) }}</span>
              </div>
            </div>

            <div class="node-icon-actions">
              <button
                class="btn btn-primary btn-sm"
                :disabled="saving === nodeType"
                @click="openIconPicker(nodeType)"
              >
                Browse
              </button>
              <input
                type="text"
                class="emoji-input"
                :value="isIconUrl(getCurrentIcon(nodeType)) ? '' : getCurrentIcon(nodeType)"
                placeholder="📍"
                maxlength="2"
                @change="(e) => setEmojiIcon(nodeType, (e.target as HTMLInputElement).value)"
              />
              <button
                class="btn btn-icon"
                title="Reset to default"
                :disabled="saving === nodeType"
                @click="resetIcon(nodeType)"
              >
                ↺
              </button>
            </div>

            <div v-if="saving === nodeType" class="saving-indicator">
              Saving...
            </div>
          </div>
        </div>
      </section>

      <!-- Future settings sections can be added here -->
      <section class="settings-section placeholder">
        <h3>More Settings Coming Soon</h3>
        <p>Additional game configuration options will be added here.</p>
      </section>
    </div>

    <!-- Icon Picker Modal -->
    <IconPicker
      :model-value="''"
      :show="showIconPicker"
      @update:model-value="handleIconSelected"
      @update:show="showIconPicker = $event"
    />
  </div>
</template>

<style scoped>
.settings-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f1419;
  color: #e5e5e5;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a3040;
}

.editor-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.error-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: rgba(239, 68, 68, 0.15);
  border-bottom: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.error-banner button {
  background: none;
  border: none;
  color: #f87171;
  font-size: 18px;
  cursor: pointer;
}

.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.settings-section {
  background: #1a1f2e;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
}

.settings-section.placeholder {
  text-align: center;
  color: #6b7280;
  padding: 40px;
}

.settings-section.placeholder h3 {
  color: #9ca3af;
  margin: 0 0 8px 0;
}

.settings-section.placeholder p {
  margin: 0;
  font-size: 14px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.section-title h3 {
  margin: 0 0 4px 0;
  font-size: 18px;
  color: #e5e5e5;
}

.section-description {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
}

.loading {
  padding: 40px;
  text-align: center;
  color: #6b7280;
}

.node-icons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.node-icon-card {
  background: #0f1419;
  border-radius: 10px;
  padding: 16px;
  border: 1px solid #2a3040;
  transition: border-color 0.15s;
}

.node-icon-card:hover {
  border-color: #3b82f6;
}

.node-icon-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.node-color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.node-type-name {
  font-size: 14px;
  font-weight: 500;
  color: #e5e5e5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-icon-preview {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

.icon-display {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1f2e;
  border: 2px solid;
  border-radius: 10px;
  overflow: hidden;
}

.icon-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.icon-emoji {
  font-size: 32px;
}

.node-icon-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.emoji-input {
  width: 48px;
  padding: 6px 8px;
  background: #0a0d12;
  border: 1px solid #2a3040;
  border-radius: 6px;
  color: #e5e5e5;
  font-size: 16px;
  text-align: center;
}

.emoji-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.saving-indicator {
  margin-top: 8px;
  font-size: 11px;
  color: #3b82f6;
  text-align: center;
}

/* Buttons */
.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
  flex: 1;
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

.btn-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #374151;
  color: #9ca3af;
  font-size: 16px;
}

.btn-icon:hover:not(:disabled) {
  background: #4b5563;
  color: #e5e5e5;
}
</style>
