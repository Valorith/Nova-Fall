import { useDebugStore } from '@/stores/debug';
import { useGameStore } from '@/stores/game';
import { useSessionStore } from '@/stores/session';

// Type for combat data provider to avoid circular dependency with useCombatEngine
export interface CombatDataProvider {
  isActive: { value: boolean };
  currentBattleId: { value: string | null };
  getCombatEntitySummary: () => {
    units: { total: number; attackers: number; defenders: number; dead: number };
    buildings: { total: number };
    dev: { units: number; buildings: number };
  };
}

// Registered combat data provider (set by useCombatEngine)
let combatDataProvider: CombatDataProvider | null = null;

/**
 * Register a combat data provider to avoid circular imports
 */
export function registerCombatDataProvider(provider: CombatDataProvider): void {
  combatDataProvider = provider;
}

/**
 * Unregister the combat data provider
 */
export function unregisterCombatDataProvider(): void {
  combatDataProvider = null;
}

let initialized = false;
let rafId: number | null = null;
let lastSampleTime = 0;
let lastMemorySample = 0;
let wsEventCounts: Record<string, number> = {};
let wsOutCounts: Record<string, number> = {};
const combatCounters = { input: 0, state: 0 };

export function trackSocketEvent(eventName: string): void {
  wsEventCounts[eventName] = (wsEventCounts[eventName] ?? 0) + 1;
}

export function trackSocketEmit(eventName: string): void {
  wsOutCounts[eventName] = (wsOutCounts[eventName] ?? 0) + 1;
}

export function trackCombatInput(): void {
  combatCounters.input += 1;
}

export function trackCombatState(): void {
  combatCounters.state += 1;
}

export function initMetricsTracker(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  const debugStore = useDebugStore();
  const gameStore = useGameStore();
  const sessionStore = useSessionStore();

  // Get initial view state from registered provider (may not be registered yet)
  const initialView = combatDataProvider?.isActive.value ? 'combat' : 'map';
  debugStore.setMetric('usage', 'view', initialView, {
    label: 'Active view',
  });

  const sample = () => {
    const now = performance.now();
    if (now - lastSampleTime < 500) {
      rafId = window.requestAnimationFrame(sample);
      return;
    }
    const deltaSeconds = Math.max((now - lastSampleTime) / 1000, 0.5);
    lastSampleTime = now;

    // Use registered combat data provider (safe if not yet registered)
    const isInCombat = combatDataProvider?.isActive.value ?? false;
    debugStore.setMetric('usage', 'view', isInCombat ? 'combat' : 'map', {
      label: 'Active view',
    });

    const sessionId = sessionStore.currentSession?.id ?? gameStore.currentSessionId ?? '-';
    debugStore.setMetric('usage', 'sessionId', sessionId, { label: 'Session ID' });
    debugStore.setMetric('usage', 'activeSession', !!sessionStore.currentSession, {
      label: 'In session',
    });
    debugStore.setMetric('usage', 'socketConnected', gameStore.isSocketConnected, {
      label: 'WS connected',
    });
    debugStore.setMetric('usage', 'uptime', Number((now / 1000).toFixed(1)), {
      label: 'Uptime',
      unit: 's',
      trackHistory: true,
    });
    debugStore.setMetric('usage', 'tick', gameStore.currentTick, {
      label: 'Economy tick',
      trackHistory: true,
    });

    debugStore.setMetric('usage', 'nodeCount', gameStore.nodeList.length, {
      label: 'Nodes',
      trackHistory: true,
    });
    debugStore.setMetric('usage', 'recentUpdates', gameStore.recentlyUpdatedNodes.size, {
      label: 'Updated nodes',
      trackHistory: true,
    });

    // Get combat summary from registered provider (use defaults if not registered)
    const combatSummary = combatDataProvider?.getCombatEntitySummary() ?? {
      units: { total: 0, attackers: 0, defenders: 0, dead: 0 },
      buildings: { total: 0 },
      dev: { units: 0, buildings: 0 },
    };
    debugStore.setMetric('combat', 'unitsTotal', combatSummary.units.total, {
      label: 'Units',
      trackHistory: true,
    });
    debugStore.setMetric('combat', 'unitsAttackers', combatSummary.units.attackers, {
      label: 'Attackers',
      trackHistory: true,
    });
    debugStore.setMetric('combat', 'unitsDefenders', combatSummary.units.defenders, {
      label: 'Defenders',
      trackHistory: true,
    });
    debugStore.setMetric('combat', 'unitsDead', combatSummary.units.dead, {
      label: 'Dead units',
      trackHistory: true,
    });
    debugStore.setMetric('combat', 'buildings', combatSummary.buildings.total, {
      label: 'Buildings',
      trackHistory: true,
    });

    debugStore.setMetric('usage', 'battleId', combatDataProvider?.currentBattleId.value ?? '-', {
      label: 'Battle ID',
    });
    debugStore.setMetric('usage', 'combatActive', isInCombat, {
      label: 'Combat active',
      trackHistory: true,
    });

    if (now - lastMemorySample > 2000 && 'memory' in performance) {
      const memory = (
        performance as Performance & {
          memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
        }
      ).memory;
      if (memory) {
        debugStore.setMetric(
          'performance',
          'heapUsed',
          Number((memory.usedJSHeapSize / 1024 / 1024).toFixed(1)),
          {
            label: 'Heap used',
            unit: 'MB',
            trackHistory: true,
          }
        );
        debugStore.setMetric(
          'performance',
          'heapTotal',
          Number((memory.totalJSHeapSize / 1024 / 1024).toFixed(1)),
          {
            label: 'Heap total',
            unit: 'MB',
            trackHistory: true,
          }
        );
        lastMemorySample = now;
      }
    }

    const inboundEvents = Object.entries(wsEventCounts).map(([, value]) => value);
    const outboundEvents = Object.entries(wsOutCounts).map(([, value]) => value);
    const inboundTotal = inboundEvents.reduce((sum, value) => sum + value, 0);
    const outboundTotal = outboundEvents.reduce((sum, value) => sum + value, 0);

    debugStore.setMetric('network', 'wsIn', inboundTotal, {
      label: 'WS in (events)',
      trackHistory: true,
    });
    debugStore.setMetric('network', 'wsOut', outboundTotal, {
      label: 'WS out (events)',
      trackHistory: true,
    });
    debugStore.setMetric('network', 'wsInTypes', Object.keys(wsEventCounts).length, {
      label: 'WS in types',
      trackHistory: true,
    });
    debugStore.setMetric('network', 'wsOutTypes', Object.keys(wsOutCounts).length, {
      label: 'WS out types',
      trackHistory: true,
    });

    const inputRate = Math.round((combatCounters.input / deltaSeconds) * 10) / 10;
    const stateRate = Math.round((combatCounters.state / deltaSeconds) * 10) / 10;
    debugStore.setMetric('combat', 'inputRate', inputRate, {
      label: 'Inputs/sec',
      trackHistory: true,
    });
    debugStore.setMetric('combat', 'stateRate', stateRate, {
      label: 'States/sec',
      trackHistory: true,
    });

    combatCounters.input = 0;
    combatCounters.state = 0;
    wsEventCounts = {};
    wsOutCounts = {};

    rafId = window.requestAnimationFrame(sample);
  };

  rafId = window.requestAnimationFrame(sample);
}

export function stopMetricsTracker(): void {
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId);
    rafId = null;
  }
}
