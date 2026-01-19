import { defineStore } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';
import { loadDebugSettings, saveDebugSettings } from '@/stores/debugSettings';
import { IndexedDbStore } from '@/utils/indexedDb';

export type DebugLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DebugLogEntry {
  id: string;
  level: DebugLogLevel;
  message: string;
  context: string | null;
  timestamp: number;
}

export interface DebugMetricEntry {
  key: string;
  label: string;
  value: string | number | boolean | null;
  unit?: string;
  updatedAt: number;
  history?: number[];
}

interface DebugLogSettings {
  retentionHours: number;
  maxEntries: number;
  captureConsole: boolean;
  persistIntervalMs: number;
}

const logStore = new IndexedDbStore<DebugLogEntry>({
  dbName: 'nova-fall-debug',
  storeName: 'logs',
  version: 1,
  keyPath: 'id',
});
const DEFAULT_SETTINGS: DebugLogSettings = {
  retentionHours: 24,
  maxEntries: 2000,
  captureConsole: false,
  persistIntervalMs: 5000,
};

const LOG_LEVEL_ORDER: Record<DebugLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export const useDebugStore = defineStore('debug', () => {
  const logs = ref<DebugLogEntry[]>([]);
  const metricsByGroup = reactive<Record<string, Record<string, DebugMetricEntry>>>({});
  const settings = reactive<DebugLogSettings>({ ...DEFAULT_SETTINGS });
  const initialized = ref(false);

  let persistTimer: number | null = null;
  let logCounter = 0;
  let consoleCaptureActive = false;
  let originalConsole: {
    debug?: (...args: unknown[]) => void;
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
    log?: (...args: unknown[]) => void;
  } | null = null;
  let errorHandlersAttached = false;

  const logCount = computed(() => logs.value.length);
  const settingsLoading = ref(true);

  async function loadSettings(): Promise<void> {
    const payload = await loadDebugSettings();
    settings.retentionHours = payload.retentionHours;
    settings.maxEntries = payload.maxEntries;
    settings.captureConsole = payload.captureConsole;
    settings.persistIntervalMs = payload.persistIntervalMs;
  }

  async function loadLogs(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const stored = await logStore.getAll();
      logs.value = stored.filter((entry: DebugLogEntry) => entry && entry.timestamp);
      pruneLogs();
    } catch {
      console.warn('Debug logs load failed');
    }
  }

  function persistSettings(): void {
    saveDebugSettings({
      retentionHours: settings.retentionHours,
      maxEntries: settings.maxEntries,
      captureConsole: settings.captureConsole,
      persistIntervalMs: settings.persistIntervalMs,
    }).catch(() => {
      console.warn('Failed to persist debug settings');
    });
  }

  function persistLogs(): void {
    if (typeof window === 'undefined') return;
    const entries = logs.value.slice(-settings.maxEntries).map((entry) => ({
      id: entry.id,
      level: entry.level,
      message: entry.message,
      context: entry.context ?? null,
      timestamp: entry.timestamp,
    }));
    logStore
      .clear()
      .then(() => logStore.putMany(entries))
      .catch(() => {
        console.warn('Failed to persist debug logs');
      });
  }

  function schedulePersist(): void {
    if (persistTimer !== null || typeof window === 'undefined') return;
    persistTimer = window.setTimeout(() => {
      persistTimer = null;
      persistLogs();
    }, settings.persistIntervalMs);
  }

  function pruneLogs(now = Date.now()): void {
    const retentionMs = settings.retentionHours * 60 * 60 * 1000;
    const cutoff = now - retentionMs;
    logs.value = logs.value.filter((entry) => entry.timestamp >= cutoff);
    if (logs.value.length > settings.maxEntries) {
      logs.value.splice(0, logs.value.length - settings.maxEntries);
    }
    if (logs.value.length && typeof window !== 'undefined') {
      schedulePersist();
    }
  }

  function addLog(level: DebugLogLevel, message: string, context?: unknown): void {
    const timestamp = Date.now();
    const entry: DebugLogEntry = {
      id: `${timestamp}-${logCounter++}`,
      level,
      message: message.trim() || '(empty message)',
      context: formatContext(context),
      timestamp,
    };
    logs.value.push(entry);
    pruneLogs(timestamp);
    schedulePersist();
  }

  function clearLogs(): void {
    logs.value = [];
    logStore.clear().catch((err) => {
      console.warn('Failed to clear debug logs:', err);
    });
    schedulePersist();
  }

  function setMetric(
    group: string,
    key: string,
    value: DebugMetricEntry['value'],
    options?: { label?: string; unit?: string; trackHistory?: boolean }
  ): void {
    if (!metricsByGroup[group]) {
      metricsByGroup[group] = {};
    }
    const existing = metricsByGroup[group][key];
    const history = existing?.history ?? [];
    if (options?.trackHistory && typeof value === 'number') {
      history.push(value);
      if (history.length > 60) {
        history.shift();
      }
    } else if (!options?.trackHistory && history.length) {
      history.length = 0;
    }
    const entry: DebugMetricEntry = {
      key,
      label: options?.label ?? key,
      value,
      updatedAt: Date.now(),
      ...(options?.unit ? { unit: options.unit } : {}),
      ...(options?.trackHistory && typeof value === 'number' ? { history: [...history] } : {}),
    };
    metricsByGroup[group][key] = entry;
  }

  function clearMetric(group: string, key: string): void {
    if (!metricsByGroup[group]) return;
    const { [key]: _removed, ...rest } = metricsByGroup[group];
    metricsByGroup[group] = rest;
  }

  function clearMetricsGroup(group: string): void {
    if (!metricsByGroup[group]) return;
    metricsByGroup[group] = {};
  }

  function getMetricGroups(): { id: string; metrics: DebugMetricEntry[] }[] {
    return Object.entries(metricsByGroup)
      .filter(([, entries]) => Object.keys(entries).length > 0)
      .map(([group, entries]) => ({
        id: group,
        metrics: Object.values(entries).sort((a, b) => a.label.localeCompare(b.label)),
      }));
  }

  function setConsoleCapture(enabled: boolean): void {
    settings.captureConsole = enabled;
    updateConsoleCapture();
  }

  function updateConsoleCapture(): void {
    if (typeof window === 'undefined') return;
    if (settings.captureConsole && !consoleCaptureActive) {
      consoleCaptureActive = true;
      originalConsole = {
        debug: console.debug,
        info: console.info,
        warn: console.warn,
        error: console.error,
        log: console.log,
      };
      console.debug = (...args: unknown[]) => {
        originalConsole?.debug?.(...args);
        addLog('debug', formatArgs(args));
      };
      console.info = (...args: unknown[]) => {
        originalConsole?.info?.(...args);
        addLog('info', formatArgs(args));
      };
      console.warn = (...args: unknown[]) => {
        originalConsole?.warn?.(...args);
        addLog('warn', formatArgs(args));
      };
      console.error = (...args: unknown[]) => {
        originalConsole?.error?.(...args);
        addLog('error', formatArgs(args));
      };
      console.log = (...args: unknown[]) => {
        originalConsole?.log?.(...args);
        addLog('info', formatArgs(args));
      };
      addLog('info', 'Console capture enabled', 'debug');
      return;
    }
    if (!settings.captureConsole && consoleCaptureActive && originalConsole) {
      consoleCaptureActive = false;
      console.debug = originalConsole.debug ?? console.debug;
      console.info = originalConsole.info ?? console.info;
      console.warn = originalConsole.warn ?? console.warn;
      console.error = originalConsole.error ?? console.error;
      console.log = originalConsole.log ?? console.log;
      originalConsole = null;
      addLog('info', 'Console capture disabled', 'debug');
    }
  }

  function attachErrorHandlers(): void {
    if (typeof window === 'undefined' || errorHandlersAttached) return;
    errorHandlersAttached = true;
    window.addEventListener('error', (event) => {
      addLog('error', event.message || 'Unhandled error', {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
      addLog('error', 'Unhandled promise rejection', { reason });
    });
  }

  async function init(): Promise<void> {
    if (initialized.value) return;
    settingsLoading.value = true;
    await loadSettings();
    settingsLoading.value = false;
    await loadLogs();
    attachErrorHandlers();
    updateConsoleCapture();
    initialized.value = true;
  }

  function formatContext(context?: unknown): string | null {
    if (context == null) return null;
    if (typeof context === 'string') return trimContext(context);
    try {
      return trimContext(JSON.stringify(context));
    } catch {
      return trimContext('unserializable');
    }
  }

  function trimContext(value: string): string {
    const maxLength = 2000;
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}...`;
  }

  function formatArgs(args: unknown[]): string {
    if (!args.length) return '(no arguments)';
    return args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        try {
          return JSON.stringify(arg);
        } catch {
          return '[unserializable]';
        }
      })
      .join(' ');
  }

  function clampNumber(value: number | undefined, min: number, max: number): number | null {
    if (value == null || Number.isNaN(value)) return null;
    return Math.min(max, Math.max(min, value));
  }

  function getLogLevelRank(level: DebugLogLevel): number {
    return LOG_LEVEL_ORDER[level] ?? 0;
  }

  watch(
    () => ({
      retentionHours: settings.retentionHours,
      maxEntries: settings.maxEntries,
      captureConsole: settings.captureConsole,
      persistIntervalMs: settings.persistIntervalMs,
    }),
    () => {
      if (settingsLoading.value) return;
      settings.retentionHours =
        clampNumber(settings.retentionHours, 1, 168) ?? settings.retentionHours;
      settings.maxEntries = clampNumber(settings.maxEntries, 100, 10000) ?? settings.maxEntries;
      settings.persistIntervalMs =
        clampNumber(settings.persistIntervalMs, 1000, 30000) ?? settings.persistIntervalMs;
      pruneLogs();
      updateConsoleCapture();
      persistSettings();
    }
  );

  void init();

  return {
    logs,
    logCount,
    settings,
    settingsLoading,
    metricsByGroup,
    getMetricGroups,
    addLog,
    clearLogs,
    setMetric,
    clearMetric,
    clearMetricsGroup,
    setConsoleCapture,
    getLogLevelRank,
  };
});
