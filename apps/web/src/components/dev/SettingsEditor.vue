<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue';
import { settingsApi, type NodeIconsMap } from '@/services/api';
import IconPicker from './IconPicker.vue';
import { NodeType, NODE_TYPE_CONFIGS, UPKEEP, COMBAT, TICK } from '@nova-fall/shared';

// State
const loading = ref(false);
const saving = ref<string | null>(null);
const error = ref<string | null>(null);
const nodeIcons = ref<NodeIconsMap>({});
const showIconPicker = ref(false);
const editingNodeType = ref<string | null>(null);
const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Game Constants State - use defaults from shared package
const gameConstants = reactive({
  // Economy
  baseNodeUpkeep: UPKEEP.BASE_NODE_COST,
  distancePenalty: UPKEEP.DISTANCE_PENALTY * 100, // Convert to percentage for display
  upkeepIntervalMinutes: UPKEEP.UPKEEP_CHECK_INTERVAL / 60000, // Convert ms to minutes

  // Combat
  prepTimeHours: COMBAT.PREP_TIME_BASE / 3600000, // Convert ms to hours
  prepTimeVarianceHours: COMBAT.PREP_TIME_VARIANCE / 3600000,
  forcesLockHours: COMBAT.FORCES_LOCK_BEFORE / 3600000,
  combatDurationMinutes: COMBAT.COMBAT_DURATION / 60000, // Convert ms to minutes
  postBattleImmunityMinutes: COMBAT.POST_BATTLE_IMMUNITY / 60000,
  attackCooldownDays: COMBAT.ATTACK_COOLDOWN / 86400000, // Convert ms to days

  // Tick
  tickIntervalSeconds: TICK.INTERVAL / 1000, // Convert ms to seconds
  resourceGenTicks: TICK.RESOURCE_GENERATION_TICKS,
  npcAiTicks: TICK.NPC_AI_TICKS,
});

// Track which settings have been modified
const modifiedSettings = ref<Set<string>>(new Set());

// Load game constants from API
async function loadGameConstants() {
  try {
    const response = await settingsApi.get('gameConstants');
    if (response.data?.data?.value) {
      const saved = response.data.data.value as Record<string, number>;
      // Merge saved values with defaults
      Object.assign(gameConstants, saved);
    }
  } catch {
    // Settings don't exist yet, use defaults
    console.log('No saved game constants, using defaults');
  }
}

// Save all modified settings
async function saveAllConstants() {
  saving.value = 'all';
  error.value = null;

  try {
    await settingsApi.set('gameConstants', { ...gameConstants });
    modifiedSettings.value.clear();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save settings';
    console.error('Failed to save game constants:', err);
  } finally {
    saving.value = null;
  }
}

// Reset all constants to defaults
async function resetAllConstants() {
  if (!confirm('Are you sure you want to reset all game constants to defaults?')) return;

  saving.value = 'all';
  error.value = null;

  try {
    // Reset to defaults from shared package
    gameConstants.baseNodeUpkeep = UPKEEP.BASE_NODE_COST;
    gameConstants.distancePenalty = UPKEEP.DISTANCE_PENALTY * 100;
    gameConstants.upkeepIntervalMinutes = UPKEEP.UPKEEP_CHECK_INTERVAL / 60000;
    gameConstants.prepTimeHours = COMBAT.PREP_TIME_BASE / 3600000;
    gameConstants.prepTimeVarianceHours = COMBAT.PREP_TIME_VARIANCE / 3600000;
    gameConstants.forcesLockHours = COMBAT.FORCES_LOCK_BEFORE / 3600000;
    gameConstants.combatDurationMinutes = COMBAT.COMBAT_DURATION / 60000;
    gameConstants.postBattleImmunityMinutes = COMBAT.POST_BATTLE_IMMUNITY / 60000;
    gameConstants.attackCooldownDays = COMBAT.ATTACK_COOLDOWN / 86400000;
    gameConstants.tickIntervalSeconds = TICK.INTERVAL / 1000;
    gameConstants.resourceGenTicks = TICK.RESOURCE_GENERATION_TICKS;
    gameConstants.npcAiTicks = TICK.NPC_AI_TICKS;

    await settingsApi.set('gameConstants', { ...gameConstants });
    modifiedSettings.value.clear();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to reset settings';
    console.error('Failed to reset game constants:', err);
  } finally {
    saving.value = null;
  }
}

// Mark a setting as modified
function markModified(key: string) {
  modifiedSettings.value.add(key);
}

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

onMounted(() => {
  loadNodeIcons();
  loadGameConstants();
});
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

      <!-- Game Constants Section -->
      <section class="settings-section">
        <div class="section-header">
          <div class="section-title">
            <h3>Game Constants</h3>
            <p class="section-description">Configure core game mechanics and timing values</p>
          </div>
          <div class="section-actions">
            <button
              v-if="modifiedSettings.size > 0"
              class="btn btn-primary"
              :disabled="saving === 'all'"
              @click="saveAllConstants"
            >
              {{ saving === 'all' ? 'Saving...' : `Save All (${modifiedSettings.size})` }}
            </button>
            <button
              class="btn btn-secondary"
              :disabled="saving === 'all'"
              @click="resetAllConstants"
            >
              Reset to Defaults
            </button>
          </div>
        </div>

        <!-- Economy Settings -->
        <div class="settings-group">
          <h4 class="group-title">Economy</h4>
          <div class="settings-grid">
            <div class="setting-item">
              <label class="setting-label">
                <span class="label-text">Base Node Upkeep</span>
                <span class="label-unit">credits/hour</span>
              </label>
              <div class="setting-input-group">
                <input
                  v-model.number="gameConstants.baseNodeUpkeep"
                  type="number"
                  min="0"
                  max="1000"
                  step="5"
                  class="setting-input"
                  @input="markModified('baseNodeUpkeep')"
                />
                <span class="setting-default">Default: {{ UPKEEP.BASE_NODE_COST }}</span>
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span class="label-text">Distance Penalty</span>
                <span class="label-unit">% per node from HQ</span>
              </label>
              <div class="setting-input-group">
                <input
                  v-model.number="gameConstants.distancePenalty"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  class="setting-input"
                  @input="markModified('distancePenalty')"
                />
                <span class="setting-default">Default: {{ UPKEEP.DISTANCE_PENALTY * 100 }}%</span>
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span class="label-text">Economy Tick Interval</span>
                <span class="label-unit">minutes</span>
              </label>
              <div class="setting-input-group">
                <input
                  v-model.number="gameConstants.upkeepIntervalMinutes"
                  type="number"
                  min="1"
                  max="1440"
                  step="1"
                  class="setting-input"
                  @input="markModified('upkeepIntervalMinutes')"
                />
                <span class="setting-default">Default: {{ UPKEEP.UPKEEP_CHECK_INTERVAL / 60000 }} min</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Combat Settings -->
        <div class="settings-group">
          <h4 class="group-title">Combat Timing</h4>
          <div class="settings-grid">
            <div class="setting-item">
              <label class="setting-label">
                <span class="label-text">Prep Time Base</span>
                <span class="label-unit">hours</span>
              </label>
              <div class="setting-input-group">
                <input
                  v-model.number="gameConstants.prepTimeHours"
                  type="number"
                  min="1"
                  max="168"
                  step="1"
                  class="setting-input"
                  @input="markModified('prepTimeHours')"
                />
                <span class="setting-default">Default: {{ COMBAT.PREP_TIME_BASE / 3600000 }}h</span>
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span class="label-text">Prep Time Variance</span>
                <span class="label-unit">± hours</span>
              </label>
              <div class="setting-input-group">
                <input
                  v-model.number="gameConstants.prepTimeVarianceHours"
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  class="setting-input"
                  @input="markModified('prepTimeVarianceHours')"
                />
                <span class="setting-default">Default: ±{{ COMBAT.PREP_TIME_VARIANCE / 3600000 }}h</span>
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span class="label-text">Forces Lock Before</span>
                <span class="label-unit">hours before combat</span>
              </label>
              <div class="setting-input-group">
                <input
                  v-model.number="gameConstants.forcesLockHours"
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  class="setting-input"
                  @input="markModified('forcesLockHours')"
                />
                <span class="setting-default">Default: {{ COMBAT.FORCES_LOCK_BEFORE / 3600000 }}h</span>
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span class="label-text">Combat Duration</span>
                <span class="label-unit">minutes</span>
              </label>
              <div class="setting-input-group">
                <input
                  v-model.number="gameConstants.combatDurationMinutes"
                  type="number"
                  min="1"
                  max="120"
                  step="5"
                  class="setting-input"
                  @input="markModified('combatDurationMinutes')"
                />
                <span class="setting-default">Default: {{ COMBAT.COMBAT_DURATION / 60000 }} min</span>
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span class="label-text">Post-Battle Immunity</span>
                <span class="label-unit">minutes</span>
              </label>
              <div class="setting-input-group">
                <input
                  v-model.number="gameConstants.postBattleImmunityMinutes"
                  type="number"
                  min="0"
                  max="60"
                  step="1"
                  class="setting-input"
                  @input="markModified('postBattleImmunityMinutes')"
                />
                <span class="setting-default">Default: {{ COMBAT.POST_BATTLE_IMMUNITY / 60000 }} min</span>
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span class="label-text">Attack Cooldown</span>
                <span class="label-unit">days</span>
              </label>
              <div class="setting-input-group">
                <input
                  v-model.number="gameConstants.attackCooldownDays"
                  type="number"
                  min="0"
                  max="30"
                  step="1"
                  class="setting-input"
                  @input="markModified('attackCooldownDays')"
                />
                <span class="setting-default">Default: {{ COMBAT.ATTACK_COOLDOWN / 86400000 }} days</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Tick Settings -->
        <div class="settings-group">
          <h4 class="group-title">Game Tick</h4>
          <div class="settings-grid">
            <div class="setting-item">
              <label class="setting-label">
                <span class="label-text">Tick Interval</span>
                <span class="label-unit">seconds</span>
              </label>
              <div class="setting-input-group">
                <input
                  v-model.number="gameConstants.tickIntervalSeconds"
                  type="number"
                  min="1"
                  max="60"
                  step="1"
                  class="setting-input"
                  @input="markModified('tickIntervalSeconds')"
                />
                <span class="setting-default">Default: {{ TICK.INTERVAL / 1000 }}s</span>
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span class="label-text">Resource Gen Every</span>
                <span class="label-unit">ticks</span>
              </label>
              <div class="setting-input-group">
                <input
                  v-model.number="gameConstants.resourceGenTicks"
                  type="number"
                  min="1"
                  max="120"
                  step="1"
                  class="setting-input"
                  @input="markModified('resourceGenTicks')"
                />
                <span class="setting-default">Default: {{ TICK.RESOURCE_GENERATION_TICKS }} ticks</span>
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span class="label-text">NPC AI Every</span>
                <span class="label-unit">ticks</span>
              </label>
              <div class="setting-input-group">
                <input
                  v-model.number="gameConstants.npcAiTicks"
                  type="number"
                  min="1"
                  max="120"
                  step="1"
                  class="setting-input"
                  @input="markModified('npcAiTicks')"
                />
                <span class="setting-default">Default: {{ TICK.NPC_AI_TICKS }} ticks</span>
              </div>
            </div>
          </div>
        </div>

        <p class="settings-note">
          <strong>Note:</strong> Changes to these settings require a server restart to take effect.
          Values are stored in the database and override the hardcoded defaults.
        </p>
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

/* Game Constants Styles */
.section-actions {
  display: flex;
  gap: 10px;
}

.settings-group {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #2a3040;
}

.settings-group:last-of-type {
  margin-bottom: 16px;
  padding-bottom: 0;
  border-bottom: none;
}

.group-title {
  margin: 0 0 16px 0;
  font-size: 15px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.setting-item {
  background: #0f1419;
  border-radius: 8px;
  padding: 14px 16px;
  border: 1px solid #2a3040;
  transition: border-color 0.15s;
}

.setting-item:hover {
  border-color: #3b82f6;
}

.setting-label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
}

.label-text {
  font-size: 14px;
  font-weight: 500;
  color: #e5e5e5;
}

.label-unit {
  font-size: 11px;
  color: #6b7280;
}

.setting-input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-input {
  width: 100%;
  padding: 10px 12px;
  background: #1a1f2e;
  border: 1px solid #2a3040;
  border-radius: 6px;
  color: #e5e5e5;
  font-size: 14px;
  font-family: 'JetBrains Mono', monospace;
}

.setting-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.setting-input::-webkit-inner-spin-button,
.setting-input::-webkit-outer-spin-button {
  opacity: 1;
}

.setting-default {
  font-size: 11px;
  color: #6b7280;
}

.settings-note {
  margin: 20px 0 0 0;
  padding: 12px 16px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 8px;
  font-size: 13px;
  color: #94a3b8;
}

.settings-note strong {
  color: #60a5fa;
}
</style>
