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

  // Get storage for a node
  function getNodeStorage(nodeId: string): ResourceStorage | undefined {
    return nodeStorage.value.get(nodeId);
  }

  // Update storage for a node (for mock data)
  function setNodeStorage(nodeId: string, storage: ResourceStorage): void {
    nodeStorage.value.set(nodeId, storage);
  }

  // Connect to WebSocket and set up handlers
  function connectSocket(sessionId?: string): void {
    gameSocket.on('connect', () => {
      isSocketConnected.value = true;
      // Join session room when connected
      if (sessionId || currentSessionId.value) {
        gameSocket.joinSession(sessionId || currentSessionId.value!);
      }
    });

    gameSocket.on('disconnect', () => {
      isSocketConnected.value = false;
    });

    gameSocket.on('node:update', handleNodeUpdate);
    gameSocket.on('node:claimed', handleNodeClaimed);
    gameSocket.on('resources:update', handleResourcesUpdate);
    gameSocket.on('upkeep:tick', handleUpkeepTick);

    gameSocket.connect();

    // If already connected, join session immediately
    if (gameSocket.isConnected && (sessionId || currentSessionId.value)) {
      gameSocket.joinSession(sessionId || currentSessionId.value!);
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
    gameSocket.disconnect();
    isSocketConnected.value = false;
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
  };
});
