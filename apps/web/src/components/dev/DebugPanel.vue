<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { useDebugStore, type DebugLogLevel } from '@/stores/debug';

const debugStore = useDebugStore();

const selectedGroup = ref('performance');
const selectedLevel = ref<DebugLogLevel | 'all'>('all');
const searchQuery = ref('');

const metricGroups = computed(() => debugStore.getMetricGroups());
const groupIds = computed(() => metricGroups.value.map((group) => group.id));
const isSettingsLoading = computed(() => debugStore.settingsLoading);
const filteredLogs = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  const minLevel =
    selectedLevel.value === 'all' ? null : debugStore.getLogLevelRank(selectedLevel.value);
  const logs = debugStore.logs.slice().reverse();
  return logs.filter((log) => {
    if (minLevel !== null && debugStore.getLogLevelRank(log.level) < minLevel) return false;
    if (!query) return true;
    return (
      log.message.toLowerCase().includes(query) ||
      (log.context?.toLowerCase().includes(query) ?? false)
    );
  });
});

function formatLogEntry(entry: {
  timestamp: number;
  level: DebugLogLevel;
  message: string;
  context: string | null;
}): string {
  const time = formatTimestamp(entry.timestamp);
  const level = formatLogLevel(entry.level);
  const base = `[${time}] ${level} ${entry.message}`;
  if (!entry.context) return base;
  return `${base} | ${entry.context}`;
}

async function copyLogEntry(entry: {
  timestamp: number;
  level: DebugLogLevel;
  message: string;
  context: string | null;
}): Promise<void> {
  if (!navigator.clipboard) return;
  await navigator.clipboard.writeText(formatLogEntry(entry));
}

async function copyAllLogs(): Promise<void> {
  if (!navigator.clipboard) return;
  const payload = filteredLogs.value.map((entry) => formatLogEntry(entry)).join('\n');
  await navigator.clipboard.writeText(payload);
}

const activeGroupMetrics = computed(() => {
  const group = metricGroups.value.find((entry) => entry.id === selectedGroup.value);
  return group?.metrics ?? [];
});

watchEffect(() => {
  if (!groupIds.value.length) return;
  const firstGroup = groupIds.value[0];
  if (firstGroup && !groupIds.value.includes(selectedGroup.value)) {
    selectedGroup.value = firstGroup;
  }
});

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

function formatMetricValue(value: unknown): string {
  if (value == null) return '-';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function buildSparkline(values: number[]): string {
  if (values.length < 2) return '0,16 100,16';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 32 - ((value - min) / range) * 28 - 2;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return points;
}

function formatLogLevel(level: DebugLogLevel): string {
  return level.toUpperCase();
}

function clearLogs(): void {
  debugStore.clearLogs();
}
</script>

<template>
  <div class="debug-panel">
    <header class="debug-header">
      <div>
        <h2>Debug Metrics</h2>
        <p>Performance, usage, and combat telemetry</p>
      </div>
      <div class="debug-actions">
        <button class="btn-secondary" @click="clearLogs">Clear Logs</button>
      </div>
    </header>

    <section class="debug-section">
      <div class="section-header">
        <h3>Logging Settings</h3>
      </div>
      <div v-if="isSettingsLoading" class="loading-state">Loading settings...</div>
      <div v-else class="settings-grid">
        <label class="settings-field">
          <span>Retention (hours)</span>
          <input
            v-model.number="debugStore.settings.retentionHours"
            type="number"
            min="1"
            max="168"
          />
        </label>
        <label class="settings-field">
          <span>Max entries</span>
          <input
            v-model.number="debugStore.settings.maxEntries"
            type="number"
            min="100"
            max="10000"
          />
        </label>
        <label class="settings-field">
          <span>Persist interval (ms)</span>
          <input
            v-model.number="debugStore.settings.persistIntervalMs"
            type="number"
            min="1000"
            max="30000"
          />
        </label>
        <label class="settings-toggle">
          <input v-model="debugStore.settings.captureConsole" type="checkbox" />
          <span>Capture console logs</span>
        </label>
      </div>
    </section>

    <section class="debug-section">
      <div class="section-header">
        <h3>Metrics</h3>
        <div class="group-tabs">
          <button
            v-for="group in metricGroups"
            :key="group.id"
            class="group-tab"
            :class="{ active: selectedGroup === group.id }"
            @click="selectedGroup = group.id"
          >
            {{ group.id }}
          </button>
        </div>
      </div>
      <div class="metrics-grid">
        <div
          v-for="metric in activeGroupMetrics"
          :key="metric.key"
          class="metric-card"
          :class="{ 'metric-card-heap': metric.key.startsWith('heap') }"
        >
          <span class="metric-label">{{ metric.label }}</span>
          <span class="metric-value">
            {{ formatMetricValue(metric.value) }}
            <span v-if="metric.unit" class="metric-unit">{{ metric.unit }}</span>
          </span>
          <div v-if="metric.history?.length" class="metric-chart">
            <span class="chart-label-y">value</span>
            <svg viewBox="0 0 100 32" preserveAspectRatio="none">
              <polyline
                :points="buildSparkline(metric.history)"
                fill="none"
                stroke="#60a5fa"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span class="chart-label-x">time</span>
          </div>
          <span class="metric-updated">Updated {{ formatTimestamp(metric.updatedAt) }}</span>
        </div>
      </div>
    </section>

    <section class="debug-section">
      <div class="section-header">
        <h3>Logs</h3>
        <div class="log-controls">
          <button class="btn-secondary" @click="copyAllLogs">Copy All</button>
          <select v-model="selectedLevel" class="log-select">
            <option value="all">All levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
          <input v-model="searchQuery" type="text" class="log-search" placeholder="Filter logs" />
        </div>
      </div>
      <div class="log-list">
        <div
          v-for="log in filteredLogs"
          :key="log.id"
          class="log-row"
          :class="`level-${log.level}`"
        >
          <span class="log-time">{{ formatTimestamp(log.timestamp) }}</span>
          <span class="log-level">{{ formatLogLevel(log.level) }}</span>
          <span class="log-message">{{ log.message }}</span>
          <button class="log-copy" @click="copyLogEntry(log)">Copy</button>
          <span v-if="log.context" class="log-context">{{ log.context }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.debug-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f1419;
  color: #e5e5e5;
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a3040;
}

.debug-header h2 {
  margin: 0 0 4px 0;
  font-size: 20px;
  font-weight: 600;
}

.debug-header p {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
}

.debug-actions {
  display: flex;
  gap: 12px;
}

.btn-secondary {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid #2a3040;
  background: #111827;
  color: #e5e5e5;
  font-size: 13px;
  cursor: pointer;
}

.btn-secondary:hover {
  background: #1f2937;
}

.debug-section {
  padding: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.section-header h3 {
  margin: 0;
  font-size: 16px;
  color: #e5e5e5;
}

.group-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.group-tab {
  background: #111827;
  border: 1px solid #2a3040;
  color: #9ca3af;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
}

.group-tab.active {
  background: #1e293b;
  color: #60a5fa;
  border-color: #3b82f6;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.metric-card {
  background: #111827;
  border: 1px solid #2a3040;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 140px;
}

.metric-card-heap {
  min-height: 280px;
  max-width: 660px;
  width: 100%;
  justify-self: start;
}

.metric-card-heap .metric-chart {
  height: 96px;
}

.metric-label {
  font-size: 12px;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.metric-value {
  font-size: 18px;
  font-weight: 600;
  color: #f8fafc;
}

.metric-unit {
  font-size: 12px;
  color: #94a3b8;
  margin-left: 4px;
}

.metric-chart {
  width: 100%;
  background: #0b1220;
  border: 1px solid #1f2937;
  border-radius: 6px;
  padding: 6px;
  display: grid;
  grid-template-columns: 16px 1fr;
  grid-template-rows: 1fr auto;
  gap: 4px;
  align-items: stretch;
  justify-items: stretch;
}

.metric-chart svg {
  width: 100%;
  height: 100%;
  grid-column: 2;
  grid-row: 1;
}

.chart-label-y {
  grid-column: 1;
  grid-row: 1;
  justify-self: center;
  align-self: center;
  transform: rotate(-90deg);
  transform-origin: center;
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}

.chart-label-x {
  grid-column: 2;
  grid-row: 2;
  text-align: center;
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}

.metric-updated {
  font-size: 11px;
  color: #6b7280;
}

.loading-state {
  padding: 12px;
  color: #6b7280;
  font-size: 12px;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.settings-field,
.settings-toggle {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #111827;
  border: 1px solid #2a3040;
  border-radius: 10px;
  padding: 12px;
  font-size: 12px;
  color: #9ca3af;
}

.settings-field input[type='number'] {
  background: #0b1220;
  border: 1px solid #2a3040;
  border-radius: 8px;
  color: #e5e5e5;
  padding: 6px 8px;
}

.settings-toggle {
  flex-direction: row;
  align-items: center;
  gap: 10px;
}

.log-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.log-select,
.log-search {
  background: #0b1220;
  border: 1px solid #2a3040;
  color: #e5e5e5;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
}

.log-search {
  width: 200px;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
}

.log-row {
  display: grid;
  grid-template-columns: 80px 70px 1fr auto;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #111827;
  border: 1px solid #1f2937;
  font-size: 12px;
  align-items: center;
}

.log-row .log-context {
  grid-column: 1 / -1;
  color: #9ca3af;
  font-size: 11px;
}

.log-copy {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #2a3040;
  background: #0b1220;
  color: #9ca3af;
  font-size: 11px;
  cursor: pointer;
}

.log-copy:hover {
  color: #e5e5e5;
  border-color: #3b82f6;
}

.log-time {
  color: #94a3b8;
}

.log-level {
  font-weight: 600;
}

.log-row.level-warn {
  border-color: rgba(251, 191, 36, 0.4);
}

.log-row.level-error {
  border-color: rgba(248, 113, 113, 0.4);
}

.log-row.level-info {
  border-color: rgba(96, 165, 250, 0.4);
}

.log-row.level-debug {
  border-color: rgba(148, 163, 184, 0.2);
}

@media (max-width: 900px) {
  .debug-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .log-row {
    grid-template-columns: 70px 60px 1fr auto;
  }
}
</style>
