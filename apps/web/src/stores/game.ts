import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { MapNode, RoadType, ResourceStorage } from '@nova-fall/shared';
import { api } from '@/services/api';
import {
  gameSocket,
  type NodeClaimedEvent,
  type NodeUpdateEvent,
  type ResourcesUpdateEvent,
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

  const nodeList = computed(() => Array.from(nodes.value.values()));

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

  // Get storage for a node
  function getNodeStorage(nodeId: string): ResourceStorage | undefined {
    return nodeStorage.value.get(nodeId);
  }

  // Update storage for a node (for mock data)
  function setNodeStorage(nodeId: string, storage: ResourceStorage): void {
    nodeStorage.value.set(nodeId, storage);
  }

  // Connect to WebSocket and set up handlers
  function connectSocket(): void {
    gameSocket.on('connect', () => {
      isSocketConnected.value = true;
    });

    gameSocket.on('disconnect', () => {
      isSocketConnected.value = false;
    });

    gameSocket.on('node:update', handleNodeUpdate);
    gameSocket.on('node:claimed', handleNodeClaimed);
    gameSocket.on('resources:update', handleResourcesUpdate);

    gameSocket.connect();
  }

  // Disconnect from WebSocket
  function disconnectSocket(): void {
    gameSocket.off('connect');
    gameSocket.off('disconnect');
    gameSocket.off('node:update');
    gameSocket.off('node:claimed');
    gameSocket.off('resources:update');
    gameSocket.disconnect();
    isSocketConnected.value = false;
  }

  return {
    // State
    nodes,
    connections,
    nodeStorage,
    currentTick,
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
