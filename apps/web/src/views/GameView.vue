<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { GameEngine, ZOOM_LEVELS, type ZoomLevel, type ConnectionData, type TransferData } from '../game';
import { NodeType, NodeStatus, RoadType, NODE_TYPE_CONFIGS, STARTING_RESOURCES, NODE_BASE_STORAGE, NODE_BASE_UPKEEP, NODE_CLAIM_COST_BY_TIER, nodeRequiresCore, getNodeProduction, nodeHasProduction, nodeSupportsCrafting, RESOURCES, getCraftingProgress, type MapNode, type ResourceStorage, type ItemStorage, type CraftingQueueItem, type CraftingQueue } from '@nova-fall/shared';
import PlayerResourcesPanel, { type UpkeepBreakdownItem, type IncomeBreakdownItem } from '@/components/game/PlayerResourcesPanel.vue';
import ResourceDisplay from '@/components/game/ResourceDisplay.vue';
import NodeTooltip from '@/components/game/NodeTooltip.vue';
import TickProgressBar from '@/components/game/TickProgressBar.vue';
import DevPanel from '@/components/game/DevPanel.vue';
import MarketPanel from '@/components/game/MarketPanel.vue';
import TransferPanel from '@/components/game/TransferPanel.vue';
import VictoryModal from '@/components/game/VictoryModal.vue';
import CoreShopPanel from '@/components/game/CoreShopPanel.vue';
import CoreSlotPanel from '@/components/game/CoreSlotPanel.vue';
import CraftingPanel from '@/components/game/CraftingPanel.vue';
import BlueprintLearnModal from '@/components/game/BlueprintLearnModal.vue';
import type { VictoryEvent } from '@/services/socket';
import { useGameStore } from '@/stores/game';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import { useItemsStore } from '@/stores/items';
import { nodesApi, sessionsApi, transfersApi, type TransferResponse } from '@/services/api';
import { hexToPixel, pixelToHex, hexKey, hexNeighbors, type HexCoord } from '../game/utils/hexGrid';

// Props - sessionId is used for session-scoped node operations
const props = defineProps<{
  sessionId: string;
}>();

const router = useRouter();
const gameStore = useGameStore();
const authStore = useAuthStore();
const toastStore = useToastStore();
const itemsStore = useItemsStore();
const sessionStore = useSessionStore();

const gameContainer = ref<HTMLDivElement | null>(null);
const engine = ref<GameEngine | null>(null);
const currentZoomLevel = ref<ZoomLevel>('strategic');
const showControls = ref(true);
const selectedNodeIds = ref<string[]>([]);
const useMockData = ref(false); // Set to false to use real API data
const isClaiming = ref(false);
const isMarketOpen = ref(false);
const isTransferOpen = ref(false);
const isShopOpen = ref(false);
const isCraftingOpen = ref(false);
const isBlueprintLearnOpen = ref(false);
const selectedBlueprintItemId = ref<string | null>(null);

// Transfer mode state (for click-to-select-destination flow)
const isTransferMode = ref(false);
const transferSourceNode = ref<MapNode | null>(null);
const transferDestNode = ref<MapNode | null>(null);
const mousePosition = ref({ x: 0, y: 0 });

// Pending transfers state (for displaying in node panels)
const pendingTransfers = ref<TransferResponse[]>([]);
const transferTimerNow = ref(Date.now()); // Reactive timer for transfer countdowns
let transferTimerInterval: ReturnType<typeof setInterval> | null = null;

// Victory state
const victoryInfo = ref<VictoryEvent | null>(null);

// Tooltip state
const hoveredNode = ref<MapNode | null>(null);
const tooltipX = ref(0);
const tooltipY = ref(0);

// Mock player resources (in production, this would come from the API/store)
const playerResources = ref<ResourceStorage>({
  ...STARTING_RESOURCES,
  minerals: 25,
  composites: 10,
});

// Mock node storage (keyed by node ID)
const nodeStorage = ref<Record<string, ResourceStorage>>({});

// Get the selected nodes data
const selectedNodes = computed(() => {
  return selectedNodeIds.value
    .map(id => gameStore.getNode(id))
    .filter((n): n is MapNode => n !== undefined);
});

// Primary selected node (first one for single selection display)
const primarySelectedNode = computed(() => selectedNodes.value[0] ?? null);

// Get storage for the selected node (from actual node data, fallback to mock)
// Excludes credits since they are global, not stored in nodes
const selectedNodeStorage = computed<ResourceStorage>(() => {
  if (!primarySelectedNode.value) return {};
  // Use actual node storage from MapNode, fallback to mock storage only if undefined
  // Note: Empty storage {} is valid - don't fall back just because storage is empty
  const nodeData = primarySelectedNode.value.storage as ResourceStorage | undefined;
  const rawStorage = nodeData !== undefined
    ? nodeData
    : (nodeStorage.value[primarySelectedNode.value.id] ?? {});

  // Filter out credits - they're a global resource, not node storage
  const { credits: _, ...nodeResources } = rawStorage;
  return nodeResources;
});

// Get storage capacity for the selected node
const selectedNodeCapacity = computed(() => {
  if (!primarySelectedNode.value) return 0;
  return NODE_BASE_STORAGE[primarySelectedNode.value.type] ?? 10000;
});

// Get current player ID
const currentPlayerId = computed(() => authStore.user?.playerId ?? null);

// Get all nodes owned by the current player
const ownedNodes = computed(() => {
  if (!currentPlayerId.value) return [];
  return gameStore.nodeList.filter(node => node.ownerId === currentPlayerId.value);
});

// Aggregate resources from all owned nodes
const aggregatedNodeResources = computed<ResourceStorage>(() => {
  const result: ResourceStorage = {};
  for (const node of ownedNodes.value) {
    const storage = node.storage as ResourceStorage | undefined;
    if (!storage) continue;
    for (const [type, amount] of Object.entries(storage)) {
      if (type === 'credits' || !amount) continue;
      result[type as keyof ResourceStorage] = (result[type as keyof ResourceStorage] ?? 0) + amount;
    }
  }
  return result;
});

// Total resources: credits from player + aggregated node resources
const totalResources = computed<ResourceStorage>(() => {
  return {
    credits: playerResources.value.credits ?? 0,
    ...aggregatedNodeResources.value,
  };
});

// Calculate upkeep breakdown for owned nodes
const upkeepBreakdown = computed<UpkeepBreakdownItem[]>(() => {
  return ownedNodes.value.map(node => {
    // Base upkeep from node type (simplified - doesn't include distance modifier for now)
    const baseUpkeep = NODE_BASE_UPKEEP[node.type] ?? 50;
    // Apply tier multiplier
    const tierMultiplier = 1 + (node.tier - 1) * 0.25;
    const amount = Math.floor(baseUpkeep * tierMultiplier);

    return {
      nodeName: node.name,
      nodeType: node.type,
      amount,
    };
  });
});

// Calculate total upkeep
const totalUpkeep = computed(() => {
  return upkeepBreakdown.value.reduce((sum, item) => sum + item.amount, 0);
});

// Calculate income breakdown
const incomeBreakdown = computed<IncomeBreakdownItem[]>(() => {
  const breakdown: IncomeBreakdownItem[] = [];
  const playerId = authStore.user?.playerId;
  if (!playerId) return breakdown;

  // HQ produces 20 credits per tick
  const hqNodes = gameStore.nodeList.filter(
    (n) => n.ownerId === playerId && n.type === NodeType.CAPITAL
  );
  for (const hq of hqNodes) {
    breakdown.push({
      source: `${hq.name} (HQ)`,
      amount: 20,
    });
  }

  return breakdown;
});

// Calculate total income
const totalIncome = computed(() => {
  return incomeBreakdown.value.reduce((sum, item) => sum + item.amount, 0);
});

// Session info for display
const currentSession = computed(() => sessionStore.currentSession);

const sessionName = computed(() => currentSession.value?.name ?? 'Unknown Session');

const sessionGameTypeShort = computed(() => {
  const type = currentSession.value?.gameType;
  if (type === 'KING_OF_THE_HILL') return 'KOTH';
  if (type === 'DOMINATION') return 'DOM';
  return '???';
});

// KOTH-specific: Crown holder info
const crownHolderName = computed(() => {
  if (!currentSession.value?.crownHolderId) return null;
  const holder = currentSession.value.players.find(
    p => p.playerId === currentSession.value?.crownHolderId
  );
  return holder?.displayName ?? 'Unknown';
});

const crownHoldDuration = computed(() => {
  if (!currentSession.value?.crownHeldSince) return null;
  const heldSince = new Date(currentSession.value.crownHeldSince).getTime();
  const now = Date.now();
  const durationMs = now - heldSince;
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  return { hours, minutes, totalMs: durationMs };
});

const timeUntilKOTHVictory = computed(() => {
  if (!crownHoldDuration.value) return null;
  const victoryTimeMs = 48 * 60 * 60 * 1000; // 48 hours
  const remainingMs = victoryTimeMs - crownHoldDuration.value.totalMs;
  if (remainingMs <= 0) return { hours: 0, minutes: 0 };
  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  return { hours, minutes };
});

// Domination-specific: Active players count
const activePlayers = computed(() => {
  if (!currentSession.value?.players) return [];
  return currentSession.value.players.filter(
    p => p.role === 'PLAYER' && !p.eliminatedAt
  );
});

const totalPlayers = computed(() => {
  if (!currentSession.value?.players) return 0;
  return currentSession.value.players.filter(p => p.role === 'PLAYER').length;
});

// Generate mock map data using hex grid placement
// Square pixel-space bounds with terrain gaps mixed throughout
function generateMockMapData(): { nodes: MapNode[]; connections: ConnectionData[] } {
  const nodes: MapNode[] = [];
  const connections: ConnectionData[] = [];

  // Seeded random for consistent results
  let seed = 42;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const nodeTypes = Object.values(NodeType).filter(t => t !== NodeType.CAPITAL);

  // Configuration
  const nodeCount = 1000;

  // Define square bounds in pixel space (creates a square game board)
  const GRID_PADDING = 150;
  const GRID_SIZE_PX = 1600;
  const minPx = GRID_PADDING;
  const maxPx = GRID_PADDING + GRID_SIZE_PX;

  // Helper to check if a hex is within square pixel bounds
  const isInSquareBounds = (hex: HexCoord): boolean => {
    const pixel = hexToPixel(hex);
    return pixel.x >= minPx && pixel.x <= maxPx && pixel.y >= minPx && pixel.y <= maxPx;
  };

  // Phase 1: Generate ALL hex positions within the square bounds via flood-fill
  const allPositions: HexCoord[] = [];
  const visited = new Set<string>();
  const frontier: HexCoord[] = [];

  const startHex = { q: 20, r: 15 }; // Approximate center
  allPositions.push(startHex);
  visited.add(hexKey(startHex));
  frontier.push(...hexNeighbors(startHex).filter(n => isInSquareBounds(n)));

  // Fill the entire square with hexes
  while (frontier.length > 0) {
    const hex = frontier.pop();
    if (!hex) continue;
    const key = hexKey(hex);
    if (visited.has(key)) continue;
    visited.add(key);

    if (isInSquareBounds(hex)) {
      allPositions.push(hex);
      for (const neighbor of hexNeighbors(hex)) {
        if (!visited.has(hexKey(neighbor))) {
          frontier.push(neighbor);
        }
      }
    }
  }

  // Phase 2: Find corner hexes for capital nodes (player starting positions)
  // Find the actual extreme hexes in the grid (not theoretical corners which may not exist)

  // Convert all positions to pixels and find extremes
  const positionsWithPixels = allPositions.map(hex => ({
    hex,
    pixel: hexToPixel(hex)
  }));

  // Find min/max x and y values
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { pixel } of positionsWithPixels) {
    minX = Math.min(minX, pixel.x);
    maxX = Math.max(maxX, pixel.x);
    minY = Math.min(minY, pixel.y);
    maxY = Math.max(maxY, pixel.y);
  }

  // Find corner hexes: those at the extremes of x and y
  // Top-left: minimum x among hexes with y close to minY
  // Top-right: maximum x among hexes with y close to minY
  // Bottom-left: minimum x among hexes with y close to maxY
  // Bottom-right: maximum x among hexes with y close to maxY
  const yTolerance = 50; // Allow some tolerance for row alignment

  const topRow = positionsWithPixels.filter(p => p.pixel.y <= minY + yTolerance);
  const bottomRow = positionsWithPixels.filter(p => p.pixel.y >= maxY - yTolerance);

  const topLeft = topRow.reduce((best, curr) =>
    curr.pixel.x < best.pixel.x ? curr : best
  );
  const topRight = topRow.reduce((best, curr) =>
    curr.pixel.x > best.pixel.x ? curr : best
  );
  const bottomLeft = bottomRow.reduce((best, curr) =>
    curr.pixel.x < best.pixel.x ? curr : best
  );
  const bottomRight = bottomRow.reduce((best, curr) =>
    curr.pixel.x > best.pixel.x ? curr : best
  );

  const cornerHexes = [topLeft, topRight, bottomLeft, bottomRight];
  const cornerHexKeys = new Set<string>(cornerHexes.map(c => hexKey(c.hex)));

  // Phase 3: Shuffle positions, but ensure corners are included as nodes
  const nonCornerPositions = allPositions.filter(h => !cornerHexKeys.has(hexKey(h)));
  // Use the ordered cornerHexes array (topLeft, topRight, bottomLeft, bottomRight)
  const cornerPositions = cornerHexes.map(c => c.hex);

  // Shuffle non-corner positions
  const shuffled = [...nonCornerPositions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j] as HexCoord;
    shuffled[j] = temp as HexCoord;
  }

  // Take corners + enough shuffled positions to reach nodeCount
  const nodePositions = [...cornerPositions, ...shuffled.slice(0, nodeCount - cornerPositions.length)];
  const nodeHexKeys = new Set<string>(nodePositions.map(h => hexKey(h)));

  // Define 4 players with their HQs at corners
  const players = [
    { id: 'player-1', name: 'Helios Dominion', hqIndex: 0 },      // Top-left
    { id: 'player-2', name: 'Cryo Collective', hqIndex: 1 },      // Top-right
    { id: 'player-3', name: 'Terraform Industries', hqIndex: 2 }, // Bottom-left
    { id: 'player-4', name: 'Void Syndicate', hqIndex: 3 },       // Bottom-right
  ];
  const capitalNames = ['Solaris Prime', 'Frosthold Station', 'Ironworks Hub', 'Shadowport'];

  // Build a map of hex positions for adjacency lookup
  const hexToPosition = new Map<string, HexCoord>();
  for (const hex of nodePositions) {
    hexToPosition.set(hexKey(hex), hex);
  }

  // For each player, use BFS from their capital to claim ~15 nearby nodes
  const NODES_PER_PLAYER = 15;
  const claimedByPlayer = new Map<string, { playerId: string; playerName: string; isHQ: boolean }>();

  for (const player of players) {
    const capitalHex = cornerPositions[player.hqIndex];
    if (!capitalHex) continue;

    // BFS to find connected nodes near the capital
    const claimed: HexCoord[] = [];
    const visited = new Set<string>();
    const queue: HexCoord[] = [capitalHex];
    visited.add(hexKey(capitalHex));

    while (queue.length > 0 && claimed.length < NODES_PER_PLAYER) {
      const hex = queue.shift();
      if (!hex) break;
      const key = hexKey(hex);

      // Only claim if this is a valid node position
      if (hexToPosition.has(key)) {
        claimed.push(hex);

        // Add neighbors to queue
        for (const neighbor of hexNeighbors(hex)) {
          const neighborKey = hexKey(neighbor);
          if (!visited.has(neighborKey) && hexToPosition.has(neighborKey)) {
            visited.add(neighborKey);
            queue.push(neighbor);
          }
        }
      }
    }

    // Mark all claimed nodes for this player
    for (let i = 0; i < claimed.length; i++) {
      const hex = claimed[i];
      if (!hex) continue;
      const isHQ = i === 0; // First node (the capital) is the HQ
      claimedByPlayer.set(hexKey(hex), {
        playerId: player.id,
        playerName: player.name,
        isHQ,
      });
    }
  }

  const nodeByHexKey = new Map<string, MapNode>();
  let capitalIndex = 0;

  // Generate nodes at hex positions
  for (let i = 0; i < nodePositions.length; i++) {
    const hex = nodePositions[i];
    if (!hex) continue;
    const pixel = hexToPixel(hex);
    const key = hexKey(hex);
    const isCorner = cornerHexKeys.has(key);
    const claimInfo = claimedByPlayer.get(key);

    // Corner nodes are CAPITAL type, others are random
    const type = isCorner ? NodeType.CAPITAL : (nodeTypes[Math.floor(random() * nodeTypes.length)] as NodeType);
    const status = claimInfo ? NodeStatus.CLAIMED : NodeStatus.NEUTRAL;

    const node: MapNode = {
      id: `node-${i.toString().padStart(4, '0')}`,
      name: isCorner ? (capitalNames[capitalIndex++] ?? `Capital ${capitalIndex}`) : `Node ${i}`,
      type,
      tier: isCorner ? 1 : Math.floor(random() * 3) + 1,
      positionX: pixel.x,
      positionY: pixel.y,
      regionId: 'central-plains',
      ownerId: claimInfo?.playerId ?? null,
      status,
    };

    if (claimInfo) {
      node.ownerName = claimInfo.playerName;
      if (claimInfo.isHQ) {
        node.isHQ = true;
      }
    }

    nodes.push(node);
    nodeByHexKey.set(key, node);
  }

  // Generate connections between adjacent nodes only (flat-face connections)
  const connectedPairs = new Set<string>();
  const roadTypes = [RoadType.DIRT, RoadType.PAVED, RoadType.HIGHWAY];

  for (const hex of nodePositions) {
    const node = nodeByHexKey.get(hexKey(hex));
    if (!node) continue;
    const neighbors = hexNeighbors(hex);

    for (const neighborHex of neighbors) {
      const neighborKey = hexKey(neighborHex);
      if (!nodeHexKeys.has(neighborKey)) continue;

      const neighborNode = nodeByHexKey.get(neighborKey);
      if (!neighborNode) continue;
      const connectionKey = [node.id, neighborNode.id].sort().join('-');

      if (connectedPairs.has(connectionKey)) continue;
      connectedPairs.add(connectionKey);

      connections.push({
        fromX: node.positionX,
        fromY: node.positionY,
        toX: neighborNode.positionX,
        toY: neighborNode.positionY,
        roadType: roadTypes[Math.floor(random() * roadTypes.length)] as RoadType,
        dangerLevel: Math.floor(random() * 50),
      });
    }
  }

  return { nodes, connections };
}

onMounted(async () => {
  if (!gameContainer.value) return;

  // Initialize the game engine
  engine.value = new GameEngine({
    container: gameContainer.value,
    backgroundColor: 0x0a0a0f,
  });

  // Listen for zoom level changes
  engine.value.onZoomLevelChange = (level) => {
    currentZoomLevel.value = level;
  };

  // Listen for selection changes
  engine.value.onSelectionChange = (ids) => {
    // If in transfer mode, check if clicked node is a valid target
    if (isTransferMode.value && ids.length === 1) {
      const clickedNodeId = ids[0];
      if (clickedNodeId && isValidTransferTarget(clickedNodeId)) {
        const destNode = gameStore.getNode(clickedNodeId);
        if (destNode) {
          completeTransferSelection(destNode);
          return; // Don't change selection
        }
      }
      // Clicked on invalid target - ignore but keep transfer mode
      return;
    }

    // Normal selection behavior
    selectedNodeIds.value = ids;
  };

  // Listen for node hover (for tooltip)
  engine.value.onNodeHover = (node, screenX, screenY) => {
    hoveredNode.value = node;
    tooltipX.value = screenX;
    tooltipY.value = screenY;
  };

  // Set the current player ID for HQ highlighting
  engine.value.setCurrentPlayerId(currentPlayerId.value);

  // Helper to extract player names from nodes
  const extractPlayerNames = (nodes: MapNode[]): Map<string, string> => {
    const names = new Map<string, string>();
    for (const node of nodes) {
      if (node.ownerId && node.ownerName && !names.has(node.ownerId)) {
        names.set(node.ownerId, node.ownerName);
      }
    }
    return names;
  };

  // Load map data - use mock data if API not available or useMockData is true
  if (useMockData.value) {
    const { nodes, connections } = generateMockMapData();
    // Store mock nodes in the game store (batch load to avoid triggering updates)
    gameStore.loadNodesBatch(nodes);
    engine.value.loadMapData(nodes, connections);
    engine.value.setPlayerNames(extractPlayerNames(nodes));

    // Generate mock storage for claimed nodes
    const mockStorage: Record<string, ResourceStorage> = {};
    for (const node of nodes) {
      if (node.ownerId) {
        // Give claimed nodes some random resources
        mockStorage[node.id] = {
          credits: Math.floor(Math.random() * 500) + 100,
          iron: Math.floor(Math.random() * 200) + 50,
          energy: Math.floor(Math.random() * 150) + 25,
        };
        // Some nodes have advanced resources
        if (Math.random() > 0.7) {
          const storage = mockStorage[node.id];
          if (storage) storage.minerals = Math.floor(Math.random() * 50);
        }
        if (Math.random() > 0.8) {
          const storage = mockStorage[node.id];
          if (storage) storage.composites = Math.floor(Math.random() * 30);
        }
      }
    }
    nodeStorage.value = mockStorage;
  } else {
    try {
      // Fetch session details for display
      await sessionStore.fetchSessionById(props.sessionId);

      // Connect to WebSocket for real-time updates (pass playerId for economy updates)
      gameStore.connectSocket(props.sessionId, currentPlayerId.value);

      // Register callback to update player resources when economy tick processes
      gameStore.onEconomyProcessed((result) => {
        // Update player credits (only credits are stored in player resources)
        const updatedResources = { ...playerResources.value };
        updatedResources.credits = result.creditsAfter;
        playerResources.value = updatedResources;

        // Update node storages with produced resources
        if (result.nodeStorageUpdates) {
          for (const update of result.nodeStorageUpdates) {
            const node = gameStore.getNode(update.nodeId);
            if (node) {
              const updatedNode = { ...node, storage: update.storage };
              gameStore.setNode(updatedNode);
              engine.value?.updateNode(update.nodeId, updatedNode);
            }
          }
        }
      });

      // Register callback to handle transfer completions
      gameStore.onTransferCompleted((event) => {
        // Reload pending transfers list
        loadPendingTransfers();

        // Update nodes directly from event data (no API call needed)
        // Store updates will auto-propagate to selectedNodes/primarySelectedNode via computed
        if (event.sourceStorage) {
          gameStore.updateNode(event.sourceNodeId, { storage: event.sourceStorage });
          engine.value?.updateNode(event.sourceNodeId, { storage: event.sourceStorage });
        }
        if (event.destStorage) {
          gameStore.updateNode(event.destNodeId, { storage: event.destStorage });
          engine.value?.updateNode(event.destNodeId, { storage: event.destStorage });
        }

        // Force update hovered node if it's one of the affected nodes (ref, not from store)
        if (hoveredNode.value?.id === event.sourceNodeId && event.sourceStorage) {
          hoveredNode.value = { ...hoveredNode.value, storage: event.sourceStorage };
        } else if (hoveredNode.value?.id === event.destNodeId && event.destStorage) {
          hoveredNode.value = { ...hoveredNode.value, storage: event.destStorage };
        }
      });

      // Register callback to handle victory events
      gameStore.onVictory((event) => {
        victoryInfo.value = event;
      });

      // Register callback to handle crafting completed events
      gameStore.onCraftingCompleted((event) => {
        // Update the node's storage and crafting queue
        const node = gameStore.getNode(event.nodeId);
        if (node) {
          const updatedNode = {
            ...node,
            storage: event.storage,
            craftingQueue: event.queue,
          };
          gameStore.setNode(updatedNode);
          engine.value?.updateNode(event.nodeId, updatedNode);
        }
      });

      // Load from API with session scope
      await gameStore.loadMapData(props.sessionId);
      if (!engine.value) return; // Component unmounted during async operation
      engine.value.loadMapData(gameStore.nodeList, gameStore.connections);
      engine.value.setPlayerNames(extractPlayerNames(gameStore.nodeList));

      // Load player resources from the session
      try {
        const resourcesResponse = await sessionsApi.getMyResources();
        if (resourcesResponse.data.resources) {
          playerResources.value = resourcesResponse.data.resources;
        }
      } catch (resourceErr) {
        console.warn('Failed to load player resources:', resourceErr);
      }

      // Load pending transfers
      await loadPendingTransfers();
    } catch (err) {
      console.warn('Failed to load from API, falling back to mock data:', err);
      if (!engine.value) return; // Component unmounted during async operation
      // Fallback to mock data
      const { nodes, connections } = generateMockMapData();
      gameStore.loadNodesBatch(nodes);
      engine.value.loadMapData(nodes, connections);
      engine.value.setPlayerNames(extractPlayerNames(nodes));
    }
  }
});

// Handle returning to lobby after game ends
const handleReturnToLobby = () => {
  victoryInfo.value = null;
  router.push('/lobby');
};

onUnmounted(() => {
  // Unregister callbacks
  gameStore.offEconomyProcessed();
  gameStore.offTransferCompleted();
  gameStore.offVictory();
  gameStore.offCraftingCompleted();

  // Disconnect from WebSocket
  gameStore.disconnectSocket();

  // Clean up transfer timer
  if (transferTimerInterval) {
    clearInterval(transferTimerInterval);
    transferTimerInterval = null;
  }

  if (engine.value) {
    engine.value.destroy();
    engine.value = null;
  }
});

// Watch for node updates from WebSocket and update the renderer
watch(
  () => gameStore.recentlyUpdatedNodes.size,
  () => {
    if (!engine.value) return;

    // Update any recently changed nodes in the renderer
    for (const nodeId of gameStore.recentlyUpdatedNodes) {
      const node = gameStore.getNode(nodeId);
      if (node) {
        engine.value.updateNode(nodeId, node);
      }
    }
  }
);

// Check if there's an active crafting queue on the selected node
const hasActiveCrafting = computed(() => {
  const node = primarySelectedNode.value;
  if (!node || !node.craftingQueue) return false;
  return node.craftingQueue.length > 0;
});

// Watch pending transfers and active crafting to start/stop countdown timer
watch(
  () => ({ transfers: pendingTransfers.value.length, crafting: hasActiveCrafting.value }),
  ({ transfers, crafting }) => {
    const needsTimer = transfers > 0 || crafting;
    if (needsTimer && !transferTimerInterval) {
      // Start timer when we have pending transfers or active crafting
      transferTimerInterval = setInterval(() => {
        transferTimerNow.value = Date.now();

        // Check if any transfers have completed and reload
        const hasCompleted = pendingTransfers.value.some(
          (t) => new Date(t.completesAt).getTime() <= transferTimerNow.value
        );
        if (hasCompleted) {
          loadPendingTransfers();
        }
      }, 1000);
    } else if (!needsTimer && transferTimerInterval) {
      // Stop timer when no pending transfers and no active crafting
      clearInterval(transferTimerInterval);
      transferTimerInterval = null;
    }
  },
  { immediate: true }
);

function handleZoomIn() {
  engine.value?.zoomIn();
}

function handleZoomOut() {
  engine.value?.zoomOut();
}

function handleResetView() {
  // Center on the square grid (150 + 1600/2 = 950)
  engine.value?.panTo(950, 950, true);
  engine.value?.setZoomLevel('strategic');
}

function getZoomLevelLabel(level: ZoomLevel): string {
  return ZOOM_LEVELS.find((z) => z.level === level)?.label ?? level;
}

function getNodeTypeConfig(type: NodeType) {
  const config = NODE_TYPE_CONFIGS[type];
  if (!config) {
    // Fallback for unknown types
    console.warn(`Unknown node type: ${type}`);
    return {
      type,
      displayName: String(type),
      description: 'Unknown node type',
      baseUpkeep: 50,
      resourceBonuses: {},
      buildingSlots: 4,
      defaultResources: {},
      claimCost: { credits: 500, iron: 50, energy: 25 },
      color: '#808080',
      icon: 'unknown',
    };
  }
  return config;
}

// Map icon string keys to emoji characters
function getNodeIcon(icon: string): string {
  const iconMap: Record<string, string> = {
    mining: '\u26CF\uFE0F',       // Pick
    refinery: '\uD83C\uDFED',     // Factory
    research: '\uD83D\uDD2C',     // Microscope
    trade: '\uD83D\uDCB0',        // Money bag
    barracks: '\u2694\uFE0F',     // Crossed swords
    agricultural: '\uD83C\uDF3E', // Wheat
    power: '\u26A1',              // Lightning
    manufacturing: '\uD83D\uDD27', // Wrench
    capital: '\uD83C\uDFDB\uFE0F', // Classical building
    crown: '\uD83D\uDC51',        // Crown
  };
  return iconMap[icon] || '\u2753'; // Question mark
}

function getStatusLabel(status: NodeStatus): string {
  const labels: Record<NodeStatus, string> = {
    [NodeStatus.NEUTRAL]: 'Neutral',
    [NodeStatus.CLAIMED]: 'Claimed',
    [NodeStatus.CONTESTED]: 'Contested',
    [NodeStatus.UNDER_ATTACK]: 'Under Attack',
  };
  return labels[status];
}

function getStatusColor(status: NodeStatus): string {
  const colors: Record<NodeStatus, string> = {
    [NodeStatus.NEUTRAL]: 'text-gray-400',
    [NodeStatus.CLAIMED]: 'text-blue-400',
    [NodeStatus.CONTESTED]: 'text-orange-400',
    [NodeStatus.UNDER_ATTACK]: 'text-red-400',
  };
  return colors[status];
}

function handleClosePanel() {
  engine.value?.clearSelection();
}

async function handleSignOut() {
  await authStore.logout();
  window.location.href = '/';
}

function handleFocusNode() {
  if (primarySelectedNode.value) {
    engine.value?.panTo(primarySelectedNode.value.positionX, primarySelectedNode.value.positionY, true);
    engine.value?.setZoomLevel('node');
  }
}

// Check if market is available (Trade Hub owned by current player)
const canAccessMarket = computed(() => {
  const node = primarySelectedNode.value;
  if (!node) return false;
  if (!authStore.isAuthenticated) return false;
  if (useMockData.value) return false;
  if (node.type !== NodeType.TRADE_HUB) return false;
  if (node.ownerId !== currentPlayerId.value) return false;
  return true;
});

// Get Trade Hub node for market panel (properly typed to avoid exactOptionalPropertyTypes issues)
const selectedTradeHub = computed(() => {
  const node = primarySelectedNode.value;
  if (!node || !canAccessMarket.value) return null;

  // Filter out credits from storage - they're global, not node storage
  const rawStorage = (node.storage ?? {}) as Record<string, number>;
  const { credits: _, ...nodeStorage } = rawStorage;

  return {
    id: node.id,
    name: node.name,
    storage: nodeStorage,
  };
});

// Check if transfer is available (owned node with resources and at least one other owned node)
const canTransferResources = computed(() => {
  const node = primarySelectedNode.value;
  if (!node) return false;
  if (!authStore.isAuthenticated) return false;
  if (useMockData.value) return false;
  if (node.ownerId !== currentPlayerId.value) return false;

  // Check if node has any resources to transfer
  const storage = selectedNodeStorage.value;
  const hasResources = Object.entries(storage).some(
    ([key, amount]) => key !== 'credits' && amount && amount > 0
  );

  // Check if there's at least one other owned node to transfer to
  const hasOtherOwnedNodes = ownedNodes.value.length > 1;

  return hasResources && hasOtherOwnedNodes;
});

// Valid transfer targets (any owned node except the source)
const validTransferTargets = computed(() => {
  if (!transferSourceNode.value) return new Set<string>();
  const sourceId = transferSourceNode.value.id;
  return new Set(
    ownedNodes.value
      .filter((n) => n.id !== sourceId)
      .map((n) => n.id)
  );
});

// Check if a node is a valid transfer target
function isValidTransferTarget(nodeId: string): boolean {
  return validTransferTargets.value.has(nodeId);
}

// Get pending transfers for the selected node (as source or destination)
const selectedNodeTransfers = computed(() => {
  const node = primarySelectedNode.value;
  if (!node) return { outgoing: [], incoming: [] };

  return {
    outgoing: pendingTransfers.value.filter((t) => t.sourceNodeId === node.id),
    incoming: pendingTransfers.value.filter((t) => t.destNodeId === node.id),
  };
});

// Load pending transfers from API
async function loadPendingTransfers() {
  if (useMockData.value) return;

  try {
    const response = await transfersApi.getAll();
    pendingTransfers.value = response.data.transfers;

    // Update the renderer with transfer data for animated flow lines
    if (engine.value) {
      const transferData: TransferData[] = pendingTransfers.value.map((t) => ({
        id: t.id,
        sourceNodeId: t.sourceNodeId,
        destNodeId: t.destNodeId,
        completesAt: t.completesAt,
      }));
      engine.value.setTransfers(transferData);
    }
  } catch (err) {
    // Silently ignore 401 errors - these happen during token refresh
    // The axios interceptor will handle token refresh and retry
    const axiosErr = err as { response?: { status?: number } };
    if (axiosErr.response?.status !== 401) {
      console.error('Failed to load pending transfers:', err);
    }
  }
}

// Format time remaining for transfer (uses reactive timer)
function formatTransferTime(completesAt: string): string {
  const remaining = new Date(completesAt).getTime() - transferTimerNow.value;
  if (remaining <= 0) return 'Arriving...';

  const seconds = Math.floor(remaining / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

// Get node name by ID
function getTransferNodeName(nodeId: string): string {
  const node = gameStore.getNode(nodeId);
  return node?.name ?? 'Unknown';
}

// Enter transfer mode
function enterTransferMode() {
  const node = primarySelectedNode.value;
  if (!node || !canTransferResources.value) return;

  isTransferMode.value = true;
  transferSourceNode.value = node;
  transferDestNode.value = null;
}

// Exit transfer mode
function exitTransferMode() {
  isTransferMode.value = false;
  transferSourceNode.value = null;
  transferDestNode.value = null;
}

// Complete transfer selection (open panel with selected destination)
function completeTransferSelection(destNode: MapNode) {
  transferDestNode.value = destNode;
  isTransferMode.value = false;
  isTransferOpen.value = true;
  // Select the destination node in the details panel
  selectedNodeIds.value = [destNode.id];
}

// Handle mouse move for transfer line
function handleMouseMove(event: MouseEvent) {
  if (!isTransferMode.value) return;
  mousePosition.value = { x: event.clientX, y: event.clientY };
}

// Handle right-click to cancel transfer mode
function handleRightClick(event: MouseEvent) {
  if (isTransferMode.value) {
    event.preventDefault();
    exitTransferMode();
  }
}

// Get screen position of source node for connector line
const sourceNodeScreenPos = computed(() => {
  if (!transferSourceNode.value || !engine.value) return null;
  const node = transferSourceNode.value;
  return engine.value.worldToScreen(node.positionX, node.positionY);
});

// Get storage for the transfer source node (used by TransferPanel)
const transferSourceStorage = computed<ItemStorage>(() => {
  if (!transferSourceNode.value) return {};
  const nodeData = transferSourceNode.value.storage as ItemStorage | undefined;
  if (!nodeData) return {};
  // Filter out credits - they're a global resource, not node storage
  const { credits: _, ...nodeResources } = nodeData;
  return nodeResources;
});

// Check if selected node is HQ (Capital) owned by current player
const isSelectedNodeHQ = computed(() => {
  const node = primarySelectedNode.value;
  if (!node) return false;
  return node.type === NodeType.CAPITAL && node.ownerId === currentPlayerId.value;
});

// Check if selected node requires a core (for non-HQ, non-Crown nodes)
const selectedNodeRequiresCore = computed(() => {
  const node = primarySelectedNode.value;
  if (!node) return false;
  return nodeRequiresCore(node.type as NodeType);
});

// Check if selected node is active (has core installed or doesn't need one)
const isSelectedNodeActive = computed(() => {
  const node = primarySelectedNode.value;
  if (!node) return true; // No node = nothing to check
  if (!selectedNodeRequiresCore.value) return true; // Doesn't need core
  return node.installedCoreId !== null && node.installedCoreId !== undefined;
});

// Check if selected node is owned by current player (for core installation UI)
const isSelectedNodeOwned = computed(() => {
  const node = primarySelectedNode.value;
  if (!node) return false;
  return node.ownerId === currentPlayerId.value;
});

// Check if selected node has any production
const selectedNodeHasProduction = computed(() => {
  const node = primarySelectedNode.value;
  if (!node) return false;
  return nodeHasProduction(node.type);
});

// Check if selected node supports crafting
const selectedNodeSupportsCrafting = computed(() => {
  const node = primarySelectedNode.value;
  if (!node) return false;
  return nodeSupportsCrafting(node.type);
});

// Get production rates for selected node (with tier bonus)
const selectedNodeProduction = computed(() => {
  const node = primarySelectedNode.value;
  if (!node) return {};
  return getNodeProduction(node.type, node.tier);
});

// Format production entries for display in sidebar
const selectedNodeProductionEntries = computed(() => {
  const entries: { resourceType: string; amount: number; icon: string; name: string }[] = [];
  for (const [resourceType, amount] of Object.entries(selectedNodeProduction.value)) {
    if (amount) {
      const resource = RESOURCES[resourceType as keyof typeof RESOURCES];
      entries.push({
        resourceType,
        amount,
        icon: resource?.icon ?? '📦',
        name: resource?.name ?? resourceType,
      });
    }
  }
  return entries;
});

// Check if the selected node can be claimed
const canClaimNode = computed(() => {
  const node = primarySelectedNode.value;
  if (!node) return false;
  if (!authStore.isAuthenticated) return false;
  if (useMockData.value) return false; // Can't claim with mock data
  if (node.status !== NodeStatus.NEUTRAL) return false;

  // CAPITAL nodes cannot be claimed directly (HQs are assigned at game start)
  if (node.type === NodeType.CAPITAL) return false;

  // Check if player has enough credits
  const claimCost = NODE_CLAIM_COST_BY_TIER[node.tier] ?? NODE_CLAIM_COST_BY_TIER[1] ?? 100;
  if ((playerResources.value.credits ?? 0) < claimCost) return false;

  // Check adjacency - need to own at least one adjacent node (unless first claim)
  const playerId = authStore.user?.playerId;
  if (!playerId) return false;

  const ownedNodes = gameStore.nodeList.filter((n) => n.ownerId === playerId);

  // If player has no nodes, they can claim any valid neutral node (first claim via HQ assignment)
  // But in practice, HQ is assigned at game start, so this shouldn't happen
  if (ownedNodes.length === 0) return true;

  // Check if target node is adjacent to any owned node
  const targetHex = pixelToHex({ x: node.positionX, y: node.positionY });
  const neighborHexKeys = hexNeighbors(targetHex).map((h) => hexKey(h));

  const isAdjacent = ownedNodes.some((ownedNode) => {
    const ownedHex = pixelToHex({ x: ownedNode.positionX, y: ownedNode.positionY });
    return neighborHexKeys.includes(hexKey(ownedHex));
  });

  return isAdjacent;
});

// Check if selected node can be claimed for free (dev panel - ignores credit check)
const canClaimNodeFree = computed(() => {
  const node = primarySelectedNode.value;
  if (!node) return false;
  if (!authStore.isAuthenticated) return false;
  if (useMockData.value) return false;
  if (node.status !== NodeStatus.NEUTRAL) return false;

  // CAPITAL nodes cannot be claimed directly (HQs are assigned at game start)
  if (node.type === NodeType.CAPITAL) return false;

  // Check adjacency - need to own at least one adjacent node (unless first claim)
  const playerId = authStore.user?.playerId;
  if (!playerId) return false;

  const ownedNodes = gameStore.nodeList.filter((n) => n.ownerId === playerId);

  // If player has no nodes, they can claim any valid neutral node
  if (ownedNodes.length === 0) return true;

  // Check if target node is adjacent to any owned node
  const targetHex = pixelToHex({ x: node.positionX, y: node.positionY });
  const neighborHexKeys = hexNeighbors(targetHex).map((h) => hexKey(h));

  const isAdjacent = ownedNodes.some((ownedNode) => {
    const ownedHex = pixelToHex({ x: ownedNode.positionX, y: ownedNode.positionY });
    return neighborHexKeys.includes(hexKey(ownedHex));
  });

  return isAdjacent;
});

// Claim a node
async function handleDevResourceUpdate(resources: ResourceStorage) {
  // Update UI immediately
  playerResources.value = resources;

  // Persist to server
  try {
    await sessionsApi.updateMyResources(resources as Record<string, number>);
  } catch (err) {
    console.error('Failed to update resources on server:', err);
    toastStore.error('Failed to save resources to server');
  }
}

// Dev: Handle item added to node storage
function handleDevItemAdded(storage: ItemStorage) {
  const node = primarySelectedNode.value;
  if (!node) return;

  // Update the node's storage in the store and engine
  const updatedNode = { ...node, storage };
  gameStore.setNode(updatedNode);
  engine.value?.updateNode(node.id, updatedNode);

  toastStore.success('Item added to node storage');
}

// Dev: Claim node for free (bypasses cost)
async function handleClaimNodeFree() {
  if (!primarySelectedNode.value || isClaiming.value) return;

  const node = primarySelectedNode.value;
  const creditsBefore = playerResources.value.credits ?? 0;
  const claimCost = NODE_CLAIM_COST_BY_TIER[node.tier] ?? NODE_CLAIM_COST_BY_TIER[1] ?? 200;

  isClaiming.value = true;

  try {
    // Step 1: If we don't have enough credits, temporarily give ourselves enough
    if (creditsBefore < claimCost) {
      const tempResources = { ...playerResources.value, credits: claimCost + 100 };
      await sessionsApi.updateMyResources(tempResources as Record<string, number>);
    }

    // Step 2: Claim the node
    const response = await nodesApi.claim(node.id);
    const { node: claimedNode, resources } = response.data;

    // Update the node in the store
    if (claimedNode) {
      gameStore.setNode(claimedNode);
      engine.value?.updateNode(claimedNode.id, claimedNode);
      toastStore.success(`[DEV] Claimed ${claimedNode.name} for free!`);
    }

    // Step 3: Restore credits to what they were before (free claim)
    if (resources) {
      const restoredResources = {
        ...resources,
        credits: creditsBefore,
      };
      playerResources.value = restoredResources;
      await sessionsApi.updateMyResources(restoredResources as Record<string, number>);
    }
  } catch (err) {
    const error = err as { response?: { data?: { error?: string; message?: string } } };
    const message = error.response?.data?.message || error.response?.data?.error || 'Failed to claim node';
    toastStore.error(message);

    // Try to restore original credits on failure
    try {
      await sessionsApi.updateMyResources({ ...playerResources.value, credits: creditsBefore } as Record<string, number>);
      playerResources.value = { ...playerResources.value, credits: creditsBefore };
    } catch {
      // Ignore restore failure
    }
  } finally {
    isClaiming.value = false;
  }
}

async function handleClaimNode() {
  if (!primarySelectedNode.value || isClaiming.value) return;

  isClaiming.value = true;

  try {
    const response = await nodesApi.claim(primarySelectedNode.value.id);
    const { node, resources } = response.data;

    // Update the node in the store
    if (node) {
      gameStore.setNode(node);
      // Update in the renderer
      engine.value?.updateNode(node.id, node);
      toastStore.success(`Claimed ${node.name}!`);
    }

    // Update player resources with the new values from the server
    if (resources) {
      playerResources.value = resources;
    }
  } catch (err) {
    const error = err as { response?: { data?: { error?: string; message?: string } } };
    const message = error.response?.data?.message || error.response?.data?.error || 'Failed to claim node';
    toastStore.error(message);
  } finally {
    isClaiming.value = false;
  }
}

// Handle market transaction - refresh resources and node storage from server
async function handleMarketTransaction() {
  try {
    // Refresh player's global resources (credits)
    const resourcesResponse = await sessionsApi.getMyResources();
    if (resourcesResponse.data.resources) {
      playerResources.value = resourcesResponse.data.resources;
    }

    // Refresh the trade hub node's storage
    const tradeHub = selectedTradeHub.value;
    if (tradeHub) {
      const nodeResponse = await nodesApi.getById(tradeHub.id);
      if (nodeResponse.data) {
        gameStore.setNode(nodeResponse.data);
      }
    }
  } catch (err) {
    console.warn('Failed to refresh data after transaction:', err);
  }
}

// Handle transfer created - show success toast, update storage, and reload transfers
async function handleTransferCreated(transfer: TransferResponse) {
  toastStore.success('Resource transfer initiated');

  // Update source node storage by subtracting transferred resources
  if (transferSourceNode.value) {
    const currentStorage = { ...(transferSourceNode.value.storage as ItemStorage) };
    for (const [itemId, amount] of Object.entries(transfer.resources)) {
      if (amount && amount > 0) {
        currentStorage[itemId] = Math.max(0, (currentStorage[itemId] ?? 0) - amount);
        if (currentStorage[itemId] === 0) {
          delete currentStorage[itemId];
        }
      }
    }
    // Update the node in the store and in our local ref
    const updatedNode = { ...transferSourceNode.value, storage: currentStorage };
    gameStore.setNode(updatedNode);
    transferSourceNode.value = updatedNode;
    engine.value?.updateNode(updatedNode.id, updatedNode);
  }

  // Reload pending transfers to update the node panels
  await loadPendingTransfers();
  // Keep panel open for additional transfers, but user can close it manually
}

// Handle transfer cancelled - update source storage with returned resources
async function handleTransferCancelled(transfer: TransferResponse) {
  // The source node gets its resources back
  const sourceNode = gameStore.getNode(transfer.sourceNodeId);
  if (sourceNode) {
    const currentStorage = { ...(sourceNode.storage as ItemStorage) };
    for (const [itemId, amount] of Object.entries(transfer.resources)) {
      if (amount && amount > 0) {
        currentStorage[itemId] = (currentStorage[itemId] ?? 0) + amount;
      }
    }
    const updatedNode = { ...sourceNode, storage: currentStorage };
    gameStore.setNode(updatedNode);
    engine.value?.updateNode(updatedNode.id, updatedNode);

    // Also update transferSourceNode if it's the same node
    if (transferSourceNode.value?.id === transfer.sourceNodeId) {
      transferSourceNode.value = updatedNode;
    }
  }

  // Reload pending transfers
  await loadPendingTransfers();
}

// Handle core purchase at HQ
function handleCorePurchase(_coreId: string, storage: ItemStorage, creditsRemaining: number) {
  // Update player credits immediately from response
  playerResources.value = { ...playerResources.value, credits: creditsRemaining };

  // Update HQ node storage immediately from response
  const node = primarySelectedNode.value;
  if (node) {
    const updatedNode = { ...node, storage };
    gameStore.setNode(updatedNode);
    engine.value?.updateNode(node.id, updatedNode);
  }

  toastStore.success('Core purchased!');
}

// Handle core install on a node
function handleCoreInstall(coreId: string, storage: ItemStorage) {
  const node = primarySelectedNode.value;
  if (node) {
    const updatedNode = { ...node, storage, installedCoreId: coreId };
    gameStore.setNode(updatedNode);
    engine.value?.updateNode(node.id, updatedNode);
  }
  toastStore.success('Core installed! Node is now active.');
}

// Handle core destruction on a node
function handleCoreDestroy(storage: ItemStorage) {
  const node = primarySelectedNode.value;
  if (node) {
    const updatedNode = { ...node, storage, installedCoreId: null };
    gameStore.setNode(updatedNode);
    engine.value?.updateNode(node.id, updatedNode);
  }
  toastStore.success('Core destroyed.');
}

// Handle crafting storage update (when materials are consumed or refunded)
// Also accepts optional queue to update both atomically and avoid race conditions
function handleCraftingStorageUpdate(storage: ItemStorage, queue?: CraftingQueue) {
  const node = primarySelectedNode.value;
  if (node) {
    const updatedNode = {
      ...node,
      storage,
      ...(queue !== undefined && { craftingQueue: queue }),
    };
    gameStore.setNode(updatedNode);
    engine.value?.updateNode(node.id, updatedNode);
  }
}

// Handle crafting queue update (when craft is started or cancelled)
// Note: When both storage and queue change, use handleCraftingStorageUpdate with both params
function handleCraftingQueueUpdate(queue: CraftingQueue) {
  const node = primarySelectedNode.value;
  if (node) {
    // Read fresh from store to avoid overwriting concurrent updates
    const freshNode = gameStore.getNode(node.id);
    if (freshNode) {
      const updatedNode = { ...freshNode, craftingQueue: queue };
      gameStore.setNode(updatedNode);
      engine.value?.updateNode(node.id, updatedNode);
    }
  }
}

// Get crafting run progress for sidebar display (uses reactive timer)
function getCraftingRunProgress(item: CraftingQueueItem): number {
  return getCraftingProgress(item, transferTimerNow.value);
}

// Handle blueprint item clicked in ResourceDisplay
function handleBlueprintClicked(blueprintItemId: string) {
  selectedBlueprintItemId.value = blueprintItemId;
  isBlueprintLearnOpen.value = true;
}

// Handle blueprint learned - update node storage
function handleBlueprintLearned(storage: Record<string, number>) {
  const node = primarySelectedNode.value;
  if (node) {
    const updatedNode = { ...node, storage };
    gameStore.setNode(updatedNode);
    engine.value?.updateNode(node.id, updatedNode);
  }
  toastStore.success('Blueprint learned! Check your crafting menu.');
}
</script>

<template>
  <div
    class="relative h-screen w-screen overflow-hidden bg-gray-950"
    :class="{ 'cursor-crosshair': isTransferMode }"
    @mousemove="handleMouseMove"
    @contextmenu="handleRightClick"
  >
    <!-- Game Canvas Container -->
    <div ref="gameContainer" class="absolute inset-0" />

    <!-- Transfer Mode Connector Line -->
    <svg
      v-if="isTransferMode && sourceNodeScreenPos"
      class="absolute inset-0 pointer-events-none z-30"
      style="width: 100%; height: 100%"
    >
      <defs>
        <marker
          id="transfer-arrow"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L9,3 z" fill="#818cf8" />
        </marker>
      </defs>
      <line
        :x1="sourceNodeScreenPos.x"
        :y1="sourceNodeScreenPos.y"
        :x2="mousePosition.x"
        :y2="mousePosition.y"
        stroke="#818cf8"
        stroke-width="3"
        stroke-dasharray="8,4"
        marker-end="url(#transfer-arrow)"
      />
      <circle
        :cx="sourceNodeScreenPos.x"
        :cy="sourceNodeScreenPos.y"
        r="8"
        fill="#6366f1"
        stroke="#c7d2fe"
        stroke-width="2"
      />
    </svg>

    <!-- Transfer Mode Hint -->
    <div
      v-if="isTransferMode"
      class="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-indigo-900/90 backdrop-blur-sm px-4 py-2 rounded-lg border border-indigo-500/50 text-indigo-100 text-sm flex items-center gap-2"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
      </svg>
      Click any owned node to transfer resources
      <span class="text-indigo-400 ml-2">(Distance + quantity = travel time • Right-click to cancel)</span>
    </div>

    <!-- UI Overlay -->
    <div class="pointer-events-none absolute inset-0">
      <!-- Dev Panel (top-left, below navbar) -->
      <div class="pointer-events-auto absolute top-14 left-4 z-50">
        <DevPanel
          :resources="playerResources"
          :can-claim-node="canClaimNodeFree"
          :selected-node-name="primarySelectedNode?.name ?? ''"
          :selected-node-id="primarySelectedNode?.id ?? null"
          :is-node-owned="isSelectedNodeOwned"
          @update:resources="handleDevResourceUpdate"
          @claim-free="handleClaimNodeFree"
          @item-added="handleDevItemAdded"
        />
      </div>

      <!-- Top Bar -->
      <div class="pointer-events-auto flex items-center justify-between bg-gray-900/80 px-4 py-2 backdrop-blur-sm">
        <div class="flex items-center gap-4">
          <h1 class="text-lg font-bold text-white">Nova Fall</h1>
          <span class="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300">
            {{ getZoomLevelLabel(currentZoomLevel) }}
          </span>

          <!-- Session Info -->
          <div v-if="currentSession" class="flex items-center gap-2 ml-2 pl-4 border-l border-gray-700">
            <span class="text-sm text-gray-200 font-medium">{{ sessionName }}</span>
            <span
              class="px-1.5 py-0.5 rounded text-xs font-semibold"
              :class="currentSession.gameType === 'KING_OF_THE_HILL' ? 'bg-amber-800 text-amber-200' : 'bg-red-800 text-red-200'"
            >
              {{ sessionGameTypeShort }}
            </span>

            <!-- KOTH Victory Progress -->
            <div
              v-if="currentSession.gameType === 'KING_OF_THE_HILL'"
              class="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded bg-gray-800/80"
            >
              <span v-if="crownHolderName" class="text-xs">
                <span class="text-amber-400">&#x1F451;</span>
                <span class="text-gray-300">{{ crownHolderName }}</span>
                <span v-if="timeUntilKOTHVictory" class="text-gray-500 ml-1">
                  ({{ timeUntilKOTHVictory.hours }}h {{ timeUntilKOTHVictory.minutes }}m to win)
                </span>
              </span>
              <span v-else class="text-xs text-gray-500">Crown unclaimed</span>
            </div>

            <!-- Domination Progress -->
            <div
              v-else-if="currentSession.gameType === 'DOMINATION'"
              class="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded bg-gray-800/80"
            >
              <span class="text-xs">
                <span class="text-red-400">&#x2694;</span>
                <span class="text-gray-300">{{ activePlayers.length }}/{{ totalPlayers }} players</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Player Resources (credits global + aggregated node resources) -->
        <div class="flex items-center gap-3">
          <PlayerResourcesPanel
            :resources="totalResources"
            :total-upkeep="totalUpkeep"
            :upkeep-breakdown="upkeepBreakdown"
            :total-income="totalIncome"
            :income-breakdown="incomeBreakdown"
          />

          <!-- Upkeep Progress Bar (hourly economy tick) -->
          <TickProgressBar
            v-if="gameStore.nextUpkeepAt > 0"
            :next-tick-at="gameStore.nextUpkeepAt"
            :tick-interval="gameStore.upkeepInterval"
          />
        </div>

        <div class="flex items-center gap-2">
          <button
            class="rounded bg-gray-700 px-3 py-1 text-sm text-gray-200 hover:bg-gray-600"
            @click="router.push('/lobby')"
          >
            Back to Lobby
          </button>
          <button
            class="rounded bg-red-900/80 px-3 py-1 text-sm text-red-200 hover:bg-red-800"
            @click="handleSignOut"
          >
            Sign Out
          </button>
        </div>
      </div>

      <!-- Zoom Controls (bottom right) -->
      <div
        v-if="showControls"
        class="pointer-events-auto absolute bottom-4 right-4 flex flex-col gap-2"
      >
        <button
          class="flex h-10 w-10 items-center justify-center rounded bg-gray-800/90 text-white hover:bg-gray-700"
          title="Zoom In"
          @click="handleZoomIn"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          class="flex h-10 w-10 items-center justify-center rounded bg-gray-800/90 text-white hover:bg-gray-700"
          title="Zoom Out"
          @click="handleZoomOut"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
          </svg>
        </button>
        <button
          class="flex h-10 w-10 items-center justify-center rounded bg-gray-800/90 text-white hover:bg-gray-700"
          title="Reset View"
          @click="handleResetView"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <!-- Instructions (bottom left) -->
      <div
        v-if="showControls && !primarySelectedNode"
        class="pointer-events-auto absolute bottom-4 left-4 rounded bg-gray-900/80 px-4 py-3 text-sm backdrop-blur-sm"
      >
        <p class="mb-1 font-medium text-gray-200">Controls:</p>
        <ul class="space-y-1 text-gray-400">
          <li>Drag to pan</li>
          <li>Scroll to zoom</li>
          <li>Click node to select</li>
          <li>Shift+click for multi-select</li>
        </ul>
      </div>

      <!-- Node Detail Panel (right side) -->
      <Transition name="slide">
        <div
          v-if="primarySelectedNode"
          class="pointer-events-auto absolute right-0 top-12 bottom-0 w-80 bg-gray-900/95 backdrop-blur-sm border-l border-gray-800 overflow-y-auto"
        >
          <!-- Panel Header -->
          <div class="sticky top-0 flex items-center justify-between bg-gray-900/95 px-4 py-3 border-b border-gray-800">
            <h2 class="text-lg font-semibold text-white">
              {{ selectedNodes.length > 1 ? `${selectedNodes.length} Nodes Selected` : 'Node Details' }}
            </h2>
            <button
              class="text-gray-400 hover:text-white transition-colors"
              @click="handleClosePanel"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Single Node View -->
          <div v-if="selectedNodes.length === 1 && primarySelectedNode" class="p-4 space-y-4">
            <!-- Node Name & Type -->
            <div>
              <div class="flex items-center gap-2">
                <span
                  class="text-2xl"
                  :style="{ color: getNodeTypeConfig(primarySelectedNode.type).color }"
                >
                  {{ getNodeIcon(getNodeTypeConfig(primarySelectedNode.type).icon) }}
                </span>
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <h3 class="text-lg font-medium text-white">{{ primarySelectedNode.name }}</h3>
                    <span
                      v-if="primarySelectedNode.isHQ"
                      class="px-2 py-0.5 text-xs font-bold bg-yellow-500/20 text-yellow-400 rounded border border-yellow-500/50"
                    >
                      HQ
                    </span>
                  </div>
                  <p class="text-sm text-gray-400">{{ getNodeTypeConfig(primarySelectedNode.type).displayName }}</p>
                </div>
              </div>
            </div>

            <!-- Status & Ownership -->
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-gray-800/50 rounded px-3 py-2">
                <p class="text-xs text-gray-500 uppercase tracking-wide">Status</p>
                <p :class="['text-sm font-medium', getStatusColor(primarySelectedNode.status)]">
                  {{ getStatusLabel(primarySelectedNode.status) }}
                </p>
              </div>
              <div class="bg-gray-800/50 rounded px-3 py-2">
                <p class="text-xs text-gray-500 uppercase tracking-wide">Tier</p>
                <p class="text-sm font-medium text-yellow-400">
                  {{ 'I'.repeat(primarySelectedNode.tier) }}
                </p>
              </div>
            </div>

            <!-- Owner -->
            <div class="bg-gray-800/50 rounded px-3 py-2">
              <p class="text-xs text-gray-500 uppercase tracking-wide">Owner</p>
              <p class="text-sm font-medium" :class="primarySelectedNode.ownerName ? 'text-blue-400' : 'text-gray-500'">
                {{ primarySelectedNode.ownerName ?? 'Unclaimed' }}
              </p>
            </div>

            <!-- Production Rates -->
            <div v-if="selectedNodeHasProduction" class="bg-gray-800/50 rounded px-3 py-2">
              <div class="flex items-center justify-between mb-2">
                <p class="text-xs text-gray-500 uppercase tracking-wide">Production</p>
                <span
                  v-if="selectedNodeRequiresCore"
                  class="text-xs px-2 py-0.5 rounded"
                  :class="isSelectedNodeActive
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'"
                >
                  {{ isSelectedNodeActive ? 'Active' : 'Inactive' }}
                </span>
              </div>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="entry in selectedNodeProductionEntries"
                  :key="entry.resourceType"
                  class="flex items-center gap-1 px-2 py-1 rounded text-sm"
                  :class="isSelectedNodeActive
                    ? 'bg-green-900/30 text-green-400'
                    : 'bg-gray-700/50 text-gray-400'"
                >
                  <span>{{ entry.icon }}</span>
                  <span class="font-medium">+{{ entry.amount }}/hr</span>
                </div>
              </div>
              <p v-if="!isSelectedNodeActive && selectedNodeRequiresCore" class="text-xs text-amber-400/80 mt-2 italic">
                Install core to start producing
              </p>
            </div>

            <!-- HQ Drop Terminal Button -->
            <button
              v-if="isSelectedNodeHQ && !useMockData"
              class="w-full py-2.5 px-4 bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-900/30"
              @click="isShopOpen = true"
            >
              <span class="text-lg">🛰️</span>
              <span>HQ Planetary Drop Terminal</span>
            </button>

            <!-- Node Inactive Warning -->
            <div
              v-if="selectedNodeRequiresCore && !isSelectedNodeActive && isSelectedNodeOwned"
              class="bg-amber-900/30 border border-amber-500/30 rounded px-3 py-2"
            >
              <div class="flex items-center gap-2">
                <span class="text-amber-400 text-lg">⚠️</span>
                <div>
                  <p class="text-sm font-medium text-amber-300">Node Inactive</p>
                  <p class="text-xs text-amber-400/80">Install a matching core to enable resource production.</p>
                </div>
              </div>
            </div>

            <!-- Core Slot (non-HQ owned nodes that require cores) -->
            <CoreSlotPanel
              v-if="selectedNodeRequiresCore && isSelectedNodeOwned && !useMockData"
              :node-id="primarySelectedNode.id"
              :node-type="primarySelectedNode.type"
              :installed-core-id="primarySelectedNode.installedCoreId ?? null"
              :storage="selectedNodeStorage"
              :is-owned="isSelectedNodeOwned"
              @install="handleCoreInstall"
              @destroy="handleCoreDestroy"
            />

            <!-- Crafting Button (for nodes that support crafting) -->
            <div v-if="selectedNodeSupportsCrafting && isSelectedNodeOwned && isSelectedNodeActive && !useMockData">
              <button
                class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                @click="isCraftingOpen = true"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                Open Crafting
              </button>

              <!-- Active Crafting Progress -->
              <div
                v-if="primarySelectedNode.craftingQueue && primarySelectedNode.craftingQueue.length > 0 && primarySelectedNode.craftingQueue[0]"
                class="mt-3 bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-3"
              >
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs text-indigo-300 font-medium">Crafting</span>
                  <span class="text-xs text-indigo-200">
                    {{ primarySelectedNode.craftingQueue[0]?.completedRuns ?? 0 }}/{{ primarySelectedNode.craftingQueue[0]?.quantity ?? 0 }}
                  </span>
                </div>
                <div class="h-2 bg-gray-700 rounded-full overflow-hidden mb-1">
                  <div
                    class="h-full bg-indigo-500 transition-all duration-300"
                    :style="{ width: `${primarySelectedNode.craftingQueue[0] ? getCraftingRunProgress(primarySelectedNode.craftingQueue[0]) : 0}%` }"
                  ></div>
                </div>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-gray-400">
                    Crafting {{ primarySelectedNode.craftingQueue[0]?.outputItemId ? itemsStore.getItemDisplay(primarySelectedNode.craftingQueue[0].outputItemId).name : 'Unknown' }}
                  </span>
                  <span class="text-indigo-300 font-mono">
                    {{ primarySelectedNode.craftingQueue[0] ? getCraftingRunProgress(primarySelectedNode.craftingQueue[0]) : 0 }}%
                  </span>
                </div>
              </div>
            </div>

            <!-- Resource Storage -->
            <div>
              <p class="text-xs text-gray-500 uppercase tracking-wide mb-2">Resource Storage</p>
              <div class="bg-gray-800/50 rounded p-3">
                <ResourceDisplay
                  :resources="selectedNodeStorage"
                  :max-capacity="selectedNodeCapacity"
                  :show-zero="false"
                  @blueprint-clicked="handleBlueprintClicked"
                />
              </div>
            </div>

            <!-- Active Transfers -->
            <div v-if="selectedNodeTransfers.outgoing.length > 0 || selectedNodeTransfers.incoming.length > 0">
              <p class="text-xs text-gray-500 uppercase tracking-wide mb-2">Active Transfers</p>
              <div class="space-y-2">
                <!-- Outgoing Transfers -->
                <div
                  v-for="transfer in selectedNodeTransfers.outgoing"
                  :key="transfer.id"
                  class="bg-indigo-900/30 border border-indigo-500/30 rounded p-2"
                >
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-1 text-xs">
                      <svg class="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                      <span class="text-indigo-300">Sending to</span>
                      <span class="text-indigo-100 font-medium">{{ getTransferNodeName(transfer.destNodeId) }}</span>
                    </div>
                    <span class="text-xs text-indigo-300 font-mono">{{ formatTransferTime(transfer.completesAt) }}</span>
                  </div>
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="(amount, type) in transfer.resources"
                      :key="type"
                      class="text-xs px-1.5 py-0.5 bg-indigo-800/50 text-indigo-200 rounded"
                    >
                      {{ amount }} {{ itemsStore.getItemName(type as string) }}
                    </span>
                  </div>
                </div>

                <!-- Incoming Transfers -->
                <div
                  v-for="transfer in selectedNodeTransfers.incoming"
                  :key="transfer.id"
                  class="bg-emerald-900/30 border border-emerald-500/30 rounded p-2"
                >
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-1 text-xs">
                      <svg class="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                      </svg>
                      <span class="text-emerald-300">Incoming from</span>
                      <span class="text-emerald-100 font-medium">{{ getTransferNodeName(transfer.sourceNodeId) }}</span>
                    </div>
                    <span class="text-xs text-emerald-300 font-mono">{{ formatTransferTime(transfer.completesAt) }}</span>
                  </div>
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="(amount, type) in transfer.resources"
                      :key="type"
                      class="text-xs px-1.5 py-0.5 bg-emerald-800/50 text-emerald-200 rounded"
                    >
                      {{ amount }} {{ itemsStore.getItemName(type as string) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Buildings (placeholder) -->
            <div>
              <p class="text-xs text-gray-500 uppercase tracking-wide mb-2">Buildings</p>
              <div class="bg-gray-800/50 rounded p-3 text-center text-gray-500 text-sm">
                No buildings constructed
              </div>
            </div>

            <!-- Garrison (placeholder) -->
            <div>
              <p class="text-xs text-gray-500 uppercase tracking-wide mb-2">Garrison</p>
              <div class="bg-gray-800/50 rounded p-3 text-center text-gray-500 text-sm">
                No units stationed
              </div>
            </div>

            <!-- Actions -->
            <div class="pt-2 space-y-2">
              <!-- Market button for owned Trade Hubs -->
              <button
                v-if="canAccessMarket"
                class="w-full py-2 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
                @click="isMarketOpen = true"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Open Market
              </button>
              <!-- Transfer button for owned nodes with resources -->
              <button
                v-if="canTransferResources"
                class="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
                @click="enterTransferMode"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Transfer Resources
              </button>
              <!-- Claim button for neutral nodes -->
              <button
                v-if="canClaimNode"
                :disabled="isClaiming"
                class="w-full py-2 px-4 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
                @click="handleClaimNode"
              >
                {{ isClaiming ? 'Claiming...' : 'Claim Node' }}
              </button>
              <button
                class="w-full py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors"
                @click="handleFocusNode"
              >
                Focus on Node
              </button>
            </div>
          </div>

          <!-- Multi-select View -->
          <div v-else-if="selectedNodes.length > 1" class="p-4 space-y-3">
            <p class="text-sm text-gray-400 mb-2">Selected nodes:</p>
            <div
              v-for="node in selectedNodes"
              :key="node.id"
              class="flex items-center gap-2 bg-gray-800/50 rounded px-3 py-2"
            >
              <span :style="{ color: getNodeTypeConfig(node.type).color }">
                {{ getNodeIcon(getNodeTypeConfig(node.type).icon) }}
              </span>
              <span class="text-sm text-white">{{ node.name }}</span>
              <span :class="['text-xs ml-auto', getStatusColor(node.status)]">
                {{ getStatusLabel(node.status) }}
              </span>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Node Tooltip -->
    <NodeTooltip
      :node="hoveredNode"
      :screen-x="tooltipX"
      :screen-y="tooltipY"
    />

    <!-- Market Panel -->
    <MarketPanel
      :credits="playerResources.credits ?? 0"
      :trade-hub="selectedTradeHub"
      :is-open="isMarketOpen"
      @close="isMarketOpen = false"
      @transaction="handleMarketTransaction"
    />

    <!-- Crafting Panel -->
    <CraftingPanel
      v-if="primarySelectedNode && selectedNodeSupportsCrafting"
      :node-id="primarySelectedNode.id"
      :node-type="primarySelectedNode.type"
      :node-tier="primarySelectedNode.tier"
      :storage="selectedNodeStorage"
      :external-queue="primarySelectedNode.craftingQueue ?? []"
      :is-open="isCraftingOpen"
      @close="isCraftingOpen = false"
      @storage-updated="handleCraftingStorageUpdate"
      @queue-updated="handleCraftingQueueUpdate"
    />

    <!-- Transfer Panel -->
    <Teleport to="body">
      <div
        v-if="isTransferOpen && transferSourceNode && transferDestNode"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        @click.self="isTransferOpen = false; transferSourceNode = null; transferDestNode = null"
      >
        <TransferPanel
          :source-node="transferSourceNode"
          :dest-node="transferDestNode"
          :node-storage="transferSourceStorage"
          @close="isTransferOpen = false; transferSourceNode = null; transferDestNode = null"
          @transfer-created="(transfer) => handleTransferCreated(transfer)"
          @transfer-cancelled="(transfer) => handleTransferCancelled(transfer)"
        />
      </div>
    </Teleport>

    <!-- Victory Modal -->
    <VictoryModal
      :victory="victoryInfo"
      :current-player-id="authStore.user?.playerId ?? null"
      @close="victoryInfo = null"
      @return-to-lobby="handleReturnToLobby"
    />

    <!-- HQ Planetary Drop Terminal Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="isShopOpen && primarySelectedNode"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          @click.self="isShopOpen = false"
        >
          <div class="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden">
            <!-- Modal Header -->
            <div class="bg-gradient-to-r from-yellow-900/50 to-amber-900/50 px-5 py-4 border-b border-gray-700 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="text-2xl">🛰️</span>
                <div>
                  <h2 class="text-lg font-bold text-white">HQ Planetary Drop Terminal</h2>
                  <p class="text-xs text-gray-400">Purchase node cores for orbital delivery</p>
                </div>
              </div>
              <button
                class="text-gray-400 hover:text-white transition-colors p-1"
                @click="isShopOpen = false"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Modal Body -->
            <div class="p-5 overflow-y-auto max-h-[calc(80vh-80px)]">
              <CoreShopPanel
                :node-id="primarySelectedNode.id"
                :storage="selectedNodeStorage"
                :player-credits="playerResources.credits ?? 0"
                @purchase="handleCorePurchase"
              />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Blueprint Learn Modal -->
    <BlueprintLearnModal
      v-if="primarySelectedNode && selectedBlueprintItemId"
      :node-id="primarySelectedNode.id"
      :blueprint-item-id="selectedBlueprintItemId"
      :is-open="isBlueprintLearnOpen"
      @close="isBlueprintLearnOpen = false; selectedBlueprintItemId = null"
      @learned="handleBlueprintLearned"
    />
  </div>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.2s ease-out;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease-out;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
