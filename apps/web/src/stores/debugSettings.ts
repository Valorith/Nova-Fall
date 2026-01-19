import { settingsApi } from '@/services/api';

export interface DebugSettingsPayload {
  retentionHours: number;
  maxEntries: number;
  captureConsole: boolean;
  persistIntervalMs: number;
}

const DEFAULT_SETTINGS: DebugSettingsPayload = {
  retentionHours: 24,
  maxEntries: 2000,
  captureConsole: false,
  persistIntervalMs: 5000,
};

const SETTINGS_KEY = 'debugSettings';

export async function loadDebugSettings(): Promise<DebugSettingsPayload> {
  try {
    const response = await settingsApi.get(SETTINGS_KEY);
    const value = response.data.data.value as Partial<DebugSettingsPayload> | undefined;
    return normalizeSettings(value);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      (error as { response?: { status?: number } }).response?.status === 404
    ) {
      await saveDebugSettings({ ...DEFAULT_SETTINGS });
      return { ...DEFAULT_SETTINGS };
    }
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveDebugSettings(payload: DebugSettingsPayload): Promise<void> {
  await settingsApi.set(SETTINGS_KEY, payload);
}

function normalizeSettings(value?: Partial<DebugSettingsPayload>): DebugSettingsPayload {
  return {
    retentionHours: clampNumber(value?.retentionHours, 1, 168) ?? DEFAULT_SETTINGS.retentionHours,
    maxEntries: clampNumber(value?.maxEntries, 100, 10000) ?? DEFAULT_SETTINGS.maxEntries,
    captureConsole: value?.captureConsole ?? DEFAULT_SETTINGS.captureConsole,
    persistIntervalMs:
      clampNumber(value?.persistIntervalMs, 1000, 30000) ?? DEFAULT_SETTINGS.persistIntervalMs,
  };
}

function clampNumber(value: number | undefined, min: number, max: number): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.min(max, Math.max(min, value));
}
