import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { MapNode, RoadType, ResourceStorage } from '@nova-fall/shared';
import { api, gameApi } from '@/services/api';
import {
  gameSocket,
  type NodeClaimedEvent,
  type NodeUpdateEvent,
  type ResourcesUpdateEvent,
  type UpkeepTickEvent,
  type EconomyProcessedEvent,
  type PlayerEconomyResult,
  type TransferCompletedEvent,
  type VictoryEvent,
  type CraftingCompletedEvent,
} from '@/services/socket';

// API response types
interface MapNodeApiResponse extends MapNode {
  ownerName?: string;
}

interface ConnectionApiResponse {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  roadType: RoadType;
  dangerLevel: number;
}

export interface ConnectionData {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  roadType: RoadType;
  dangerLevel: number;
}

export const useGameStore = defineStore('game', () => {
  const nodes = ref<Map<string, MapNode>>(new Map());
  const connections = ref<ConnectionData[]>([]);
  const nodeStorage = ref<Map<string, ResourceStorage>>(new Map());
  const currentTick = ref(0);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const isSocketConnected = ref(false);
  const recentlyUpdatedNodes = ref<Set<string>>(new Set());
  const currentSessionId = ref<string | null>(null);

  // Upkeep/economy tick timing for progress bar (hourly)
  const nextUpkeepAt = ref(0);
  const upkeepInterval = ref(3600000); // Default 1 hour

  // Callback for economy processed events (registered by GameView)
  let economyProcessedCallback: ((result: PlayerEconomyResult) => void) | null = null;

  // Callback for transfer completed events (registered by GameView)
  let transferCompletedCallback: ((event: TransferCompletedEvent) => void) | null = null;

  // Callback for victory events (registered by GameView)
  let victoryCallback: ((event: VictoryEvent) => void) | null = null;

  // Callback for crafting completed events (registered by GameView)
  let craftingCompletedCallback: ((event: CraftingCompletedEvent) => void) | null = null;

  const nodeList = computed(() => Array.from(nodes.value.values()));

  // Load game status (upkeep timing)
  async function loadGameStatus(): Promise<void> {
    try {
      const response = await gameApi.getStatus();
      nextUpkeepAt.value = response.data.nextUpkeepAt;
      upkeepInterval.value = response.data.upkeepInterval;
    } catch (err) {
      console.error('Failed to load game status:', err);
      // Non-fatal - progress bar will just show 0
    }
  }

  // Load initial map data from API (optionally scoped to a session)
  async function loadMapData(sessionId?: string): Promise<void> {
    isLoading.value = true;
    error.value = null;
    currentSessionId.value = sessionId ?? null;

    try {
      // Build query params for session-scoped requests
      const nodesUrl = sessionId ? `/nodes?sessionId=${sessionId}` : '/nodes';

      const [nodesResponse, connectionsResponse] = await Promise.all([
        api.get<{ nodes: MapNodeApiResponse[] }>(nodesUrl),
        api.get<{ connections: ConnectionApiResponse[] }>('/nodes/connections'),
        loadGameStatus(), // Load upkeep timing in parallel
      ]);

      // Populate nodes map
      nodes.value.clear();
      for (const node of nodesResponse.data.nodes) {
        nodes.value.set(node.id, node);
      }

      // Store connections
      connections.value = connectionsResponse.data.connections.map((conn) => ({
        fromX: conn.fromX,
        fromY: conn.fromY,
        toX: conn.toX,
        toY: conn.toY,
        roadType: conn.roadType,
        dangerLevel: conn.dangerLevel,
      }));
    } catch (err) {
      console.error('Failed to load map data:', err);
      error.value = 'Failed to load map data';
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  // Update a single node
  function updateNode(nodeId: string, changes: Partial<MapNode>): void {
    const existing = nodes.value.get(nodeId);
    if (existing) {
      nodes.value.set(nodeId, { ...existing, ...changes });
      markNodeAsUpdated(nodeId);
    }
  }

  // Replace a node entirely
  function setNode(node: MapNode): void {
    nodes.value.set(node.id, node);
    markNodeAsUpdated(node.id);
  }

  // Batch load nodes without triggering update notifications (for initial load)
  function loadNodesBatch(nodeList: MapNode[]): void {
    for (const node of nodeList) {
      nodes.value.set(node.id, node);
    }
  }

  // Mark a node as recently updated (for visual feedback)
  function markNodeAsUpdated(nodeId: string): void {
    recentlyUpdatedNodes.value.add(nodeId);
    // Clear the update indicator after 3 seconds
    setTimeout(() => {
      recentlyUpdatedNodes.value.delete(nodeId);
    }, 3000);
  }

  function isNodeRecentlyUpdated(nodeId: string): boolean {
    return recentlyUpdatedNodes.value.has(nodeId);
  }

  // Get a single node
  function getNode(nodeId: string): MapNode | undefined {
    return nodes.value.get(nodeId);
  }

  // WebSocket event handlers
  function handleNodeUpdate(event: NodeUpdateEvent): void {
    updateNode(event.nodeId, event.changes);
  }

  function handleNodeClaimed(event: NodeClaimedEvent): void {
    setNode(event.node);
  }

  function handleResourcesUpdate(event: ResourcesUpdateEvent): void {
    currentTick.value = event.tick;
    for (const update of event.updates) {
      nodeStorage.value.set(update.nodeId, update.storage);
    }
  }

  function handleUpkeepTick(event: UpkeepTickEvent): void {
    nextUpkeepAt.value = event.nextUpkeepAt;
    upkeepInterval.value = event.upkeepInterval;
  }

  function handleEconomyProcessed(event: EconomyProcessedEvent, currentPlayerId: string | null): void {
    if (!currentPlayerId) return;

    // Find the current player's result
    const playerResult = event.results.find((r) => r.playerId === currentPlayerId);
    if (playerResult && economyProcessedCallback) {
      economyProcessedCallback(playerResult);
    }
  }

  // Register callback for economy processed events
  function onEconomyProcessed(callback: (result: PlayerEconomyResult) => void): void {
    economyProcessedCallback = callback;
  }

  // Unregister callback
  function offEconomyProcessed(): void {
    economyProcessedCallback = null;
  }

  // Handle transfer completed events
  function handleTransferCompleted(event: TransferCompletedEvent, currentPlayerId: string | null): void {
    if (!currentPlayerId || event.playerId !== currentPlayerId) return;
    transferCompletedCallback?.(event);
  }

  // Register callback for transfer completed events
  function onTransferCompleted(callback: (event: TransferCompletedEvent) => void): void {
    transferCompletedCallback = callback;
  }

  // Unregister transfer callback
  function offTransferCompleted(): void {
    transferCompletedCallback = null;
  }

  // Handle victory events
  function handleVictory(event: VictoryEvent): void {
    victoryCallback?.(event);
  }

  // Register callback for victory events
  function onVictory(callback: (event: VictoryEvent) => void): void {
    victoryCallback = callback;
  }

  // Unregister victory callback
  function offVictory(): void {
    victoryCallback = null;
  }

  // Handle crafting completed events
  function handleCraftingCompleted(event: CraftingCompletedEvent, currentPlayerId: string | null): void {
    if (!currentPlayerId || event.playerId !== currentPlayerId) return;
    craftingCompletedCallback?.(event);
  }

  // Register callback for crafting completed events
  function onCraftingCompleted(callback: (event: CraftingCompletedEvent) => void): void {
    craftingCompletedCallback = callback;
  }

  // Unregister crafting callback
  function offCraftingCompleted(): void {
    craftingCompletedCallback = null;
  }

  // Get storage for a node
  function getNodeStorage(nodeId: string): ResourceStorage | undefined {
    return nodeStorage.value.get(nodeId);
  }

  // Update storage for a node (for mock data)
  function setNodeStorage(nodeId: string, storage: ResourceStorage): void {
    nodeStorage.value.set(nodeId, storage);
  }

  // Connect to WebSocket and set up handlers
  function connectSocket(sessionId?: string, playerId?: string | null): void {
    gameSocket.on('connect', () => {
      isSocketConnected.value = true;
      // Join session room when connected
      const sessionToJoin = sessionId || currentSessionId.value;
      if (sessionToJoin) {
        gameSocket.joinSession(sessionToJoin);
      }
    });

    gameSocket.on('disconnect', () => {
      isSocketConnected.value = false;
    });

    gameSocket.on('node:update', handleNodeUpdate);
    gameSocket.on('node:claimed', handleNodeClaimed);
    gameSocket.on('resources:update', handleResourcesUpdate);
    gameSocket.on('upkeep:tick', handleUpkeepTick);
    gameSocket.on('economy:processed', (event) => handleEconomyProcessed(event, playerId ?? null));
    gameSocket.on('transfer:completed', (event) => handleTransferCompleted(event, playerId ?? null));
    gameSocket.on('game:victory', handleVictory);
    gameSocket.on('crafting:completed', (event) => handleCraftingCompleted(event, playerId ?? null));

    gameSocket.connect();

    // If already connected, join session immediately
    const sessionToJoin = sessionId || currentSessionId.value;
    if (gameSocket.isConnected && sessionToJoin) {
      gameSocket.joinSession(sessionToJoin);
    }
  }

  // Disconnect from WebSocket
  function disconnectSocket(): void {
    // Leave session room before disconnecting
    if (currentSessionId.value) {
      gameSocket.leaveSession(currentSessionId.value);
    }

    gameSocket.off('connect');
    gameSocket.off('disconnect');
    gameSocket.off('node:update');
    gameSocket.off('node:claimed');
    gameSocket.off('resources:update');
    gameSocket.off('upkeep:tick');
    gameSocket.off('economy:processed');
    gameSocket.off('transfer:completed');
    gameSocket.off('crafting:completed');
    gameSocket.disconnect();
    isSocketConnected.value = false;
    economyProcessedCallback = null;
    transferCompletedCallback = null;
    craftingCompletedCallback = null;
  }

  return {
    // State
    nodes,
    connections,
    nodeStorage,
    currentTick,
    nextUpkeepAt,
    upkeepInterval,
    isLoading,
    error,
    isSocketConnected,
    recentlyUpdatedNodes,
    currentSessionId,

    // Computed
    nodeList,

    // Actions
    loadMapData,
    updateNode,
    setNode,
    loadNodesBatch,
    getNode,
    getNodeStorage,
    setNodeStorage,
    isNodeRecentlyUpdated,
    connectSocket,
    disconnectSocket,
    onEconomyProcessed,
    offEconomyProcessed,
    onTransferCompleted,
    offTransferCompleted,
    onVictory,
    offVictory,
    onCraftingCompleted,
    offCraftingCompleted,
  };
});
