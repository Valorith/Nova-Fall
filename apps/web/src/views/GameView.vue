<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { GameEngine, ZOOM_LEVELS, type ZoomLevel, type ConnectionData, type TransferData } from '../game';
import { NodeType, NodeStatus, RoadType, NODE_TYPE_CONFIGS, STARTING_RESOURCES, NODE_BASE_STORAGE, NODE_BASE_UPKEEP, NODE_CLAIM_COST_BY_TIER, type MapNode, type ResourceStorage } from '@nova-fall/shared';
import PlayerResourcesPanel, { type UpkeepBreakdownItem, type IncomeBreakdownItem } from '@/components/game/PlayerResourcesPanel.vue';
import ResourceDisplay from '@/components/game/ResourceDisplay.vue';
import NodeTooltip from '@/components/game/NodeTooltip.vue';
import TickProgressBar from '@/components/game/TickProgressBar.vue';
import DevPanel from '@/components/game/DevPanel.vue';
import MarketPanel from '@/components/game/MarketPanel.vue';
import TransferPanel from '@/components/game/TransferPanel.vue';
import { useGameStore } from '@/stores/game';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
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

const gameContainer = ref<HTMLDivElement | null>(null);
const engine = ref<GameEngine | null>(null);
const currentZoomLevel = ref<ZoomLevel>('strategic');
const showControls = ref(true);
const selectedNodeIds = ref<string[]>([]);
const useMockData = ref(false); // Set to false to use real API data
const isClaiming = ref(false);
const isMarketOpen = ref(false);
const isTransferOpen = ref(false);

// Transfer mode state (for click-to-select-destination flow)
const isTransferMode = ref(false);
const transferSourceNode = ref<MapNode | null>(null);
const transferDestNode = ref<MapNode | null>(null);
const mousePosition = ref({ x: 0, y: 0 });

// Pending transfers state (for displaying in node panels)
const pendingTransfers = ref<TransferResponse[]>([]);
const transferTimerNow = ref(Date.now()); // Reactive timer for transfer countdowns
let transferTimerInterval: ReturnType<typeof setInterval> | null = null;

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
  // Use actual node storage from MapNode, fallback to mock storage for development
  const nodeData = primarySelectedNode.value.storage as ResourceStorage | undefined;
  const rawStorage = (nodeData && Object.keys(nodeData).length > 0)
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

// Calculate income breakdown (requires buildings - not implemented yet)
const incomeBreakdown = computed<IncomeBreakdownItem[]>(() => {
  // No passive income without buildings
  return [];
});

// Calculate total income
const totalIncome = computed(() => {
  return 0;
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
    const hex = frontier.pop()!;
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

  console.log('Corner capitals:', [
    `Top-left: hex(${topLeft.hex.q},${topLeft.hex.r}) at pixel(${topLeft.pixel.x.toFixed(0)},${topLeft.pixel.y.toFixed(0)})`,
    `Top-right: hex(${topRight.hex.q},${topRight.hex.r}) at pixel(${topRight.pixel.x.toFixed(0)},${topRight.pixel.y.toFixed(0)})`,
    `Bottom-left: hex(${bottomLeft.hex.q},${bottomLeft.hex.r}) at pixel(${bottomLeft.pixel.x.toFixed(0)},${bottomLeft.pixel.y.toFixed(0)})`,
    `Bottom-right: hex(${bottomRight.hex.q},${bottomRight.hex.r}) at pixel(${bottomRight.pixel.x.toFixed(0)},${bottomRight.pixel.y.toFixed(0)})`,
  ]);

  // Phase 3: Shuffle positions, but ensure corners are included as nodes
  const nonCornerPositions = allPositions.filter(h => !cornerHexKeys.has(hexKey(h)));
  // Use the ordered cornerHexes array (topLeft, topRight, bottomLeft, bottomRight)
  const cornerPositions = cornerHexes.map(c => c.hex);

  // Shuffle non-corner positions
  const shuffled = [...nonCornerPositions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  // Take corners + enough shuffled positions to reach nodeCount
  const nodePositions = [...cornerPositions, ...shuffled.slice(0, nodeCount - cornerPositions.length)];
  const nodeHexKeys = new Set<string>(nodePositions.map(h => hexKey(h)));
  const terrainGaps = new Set<string>(shuffled.slice(nodeCount - cornerPositions.length).map(h => hexKey(h)));

  console.log(`Grid has ${allPositions.length} hexes: ${nodePositions.length} nodes (${cornerPositions.length} capitals), ${terrainGaps.size} terrain`);

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
      const hex = queue.shift()!;
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
      const hex = claimed[i]!;
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

  console.log('Player territories:', players.map(p => {
    const count = [...claimedByPlayer.values()].filter(c => c.playerId === p.id).length;
    return `${p.name}: ${count} nodes`;
  }));

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

  console.log(`Generated ${nodes.length} nodes with ${connections.length} connections`);

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
          mockStorage[node.id]!.minerals = Math.floor(Math.random() * 50);
        }
        if (Math.random() > 0.8) {
          mockStorage[node.id]!.composites = Math.floor(Math.random() * 30);
        }
      }
    }
    nodeStorage.value = mockStorage;
  } else {
    try {
      // Connect to WebSocket for real-time updates (pass playerId for economy updates)
      gameStore.connectSocket(props.sessionId, currentPlayerId.value);

      // Register callback to update player resources when economy tick processes
      gameStore.onEconomyProcessed((result) => {
        // Update player resources with the new values after economy tick
        const updatedResources = { ...playerResources.value };
        updatedResources.credits = result.creditsAfter;

        // Add generated resources
        for (const [resourceType, amount] of Object.entries(result.resourcesGenerated)) {
          if (resourceType !== 'credits' && amount) {
            updatedResources[resourceType as keyof typeof updatedResources] =
              (updatedResources[resourceType as keyof typeof updatedResources] ?? 0) + amount;
          }
        }

        playerResources.value = updatedResources;
        console.log('[GameView] Player resources updated from economy tick:', updatedResources);
      });

      // Register callback to handle transfer completions
      gameStore.onTransferCompleted(async (event) => {
        console.log('[GameView] Transfer completed:', event.transferId, event.status);

        // Reload pending transfers and node data in parallel
        await Promise.all([
          loadPendingTransfers(),
          gameStore.loadMapData(props.sessionId),
        ]);

        // Update renderer with new data
        if (engine.value) {
          engine.value.loadMapData(gameStore.nodeList, gameStore.connections);
        }
      });

      // Load from API with session scope
      await gameStore.loadMapData(props.sessionId);
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
      // Fallback to mock data
      const { nodes, connections } = generateMockMapData();
      gameStore.loadNodesBatch(nodes);
      engine.value.loadMapData(nodes, connections);
      engine.value.setPlayerNames(extractPlayerNames(nodes));
    }
  }
});

onUnmounted(() => {
  // Unregister callbacks
  gameStore.offEconomyProcessed();
  gameStore.offTransferCompleted();

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

// Watch pending transfers to start/stop countdown timer
watch(
  () => pendingTransfers.value.length,
  (newCount) => {
    if (newCount > 0 && !transferTimerInterval) {
      // Start timer when we have pending transfers
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
    } else if (newCount === 0 && transferTimerInterval) {
      // Stop timer when no pending transfers
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
  return NODE_TYPE_CONFIGS[type];
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
    console.error('Failed to load pending transfers:', err);
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

// Check if the selected node can be claimed
const canClaimNode = computed(() => {
  const node = primarySelectedNode.value;
  if (!node) return false;
  if (!authStore.isAuthenticated) return false;
  if (useMockData.value) return false; // Can't claim with mock data
  if (node.status !== NodeStatus.NEUTRAL) return false;

  // CAPITAL and CROWN nodes cannot be claimed directly
  if (node.type === NodeType.CAPITAL || node.type === NodeType.CROWN) return false;

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

// Dev: Claim node for free (bypasses cost)
async function handleClaimNodeFree() {
  if (!primarySelectedNode.value || isClaiming.value) return;

  // Store current credits before claiming
  const creditsBefore = playerResources.value.credits ?? 0;

  isClaiming.value = true;

  try {
    const response = await nodesApi.claim(primarySelectedNode.value.id);
    const { node, resources } = response.data;

    // Update the node in the store
    if (node) {
      gameStore.setNode(node);
      engine.value?.updateNode(node.id, node);
      toastStore.success(`[DEV] Claimed ${node.name} for free!`);
    }

    // Restore credits to what they were before (free claim)
    if (resources) {
      const restoredResources = {
        ...resources,
        credits: creditsBefore,
      };
      playerResources.value = restoredResources;

      // Persist restored credits to server
      try {
        await sessionsApi.updateMyResources(restoredResources as Record<string, number>);
      } catch (restoreErr) {
        console.error('Failed to restore credits on server:', restoreErr);
      }
    }
  } catch (err) {
    const error = err as { response?: { data?: { error?: string; message?: string } } };
    const message = error.response?.data?.message || error.response?.data?.error || 'Failed to claim node';
    toastStore.error(message);
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

// Handle market transaction - refresh resources from server
async function handleMarketTransaction() {
  try {
    const resourcesResponse = await sessionsApi.getMyResources();
    if (resourcesResponse.data.resources) {
      playerResources.value = resourcesResponse.data.resources;
    }
  } catch (err) {
    console.warn('Failed to refresh resources after transaction:', err);
  }
}

// Handle transfer created - show success toast and clean up
async function handleTransferCreated() {
  toastStore.success('Resource transfer initiated');
  // Reload pending transfers to update the node panels
  await loadPendingTransfers();
  // Keep panel open for additional transfers, but user can close it manually
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
          :can-claim-node="canClaimNode"
          :selected-node-name="primarySelectedNode?.name ?? ''"
          @update:resources="handleDevResourceUpdate"
          @claim-free="handleClaimNodeFree"
        />
      </div>

      <!-- Top Bar -->
      <div class="pointer-events-auto flex items-center justify-between bg-gray-900/80 px-4 py-2 backdrop-blur-sm">
        <div class="flex items-center gap-4">
          <h1 class="text-lg font-bold text-white">Nova Fall</h1>
          <span class="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300">
            {{ getZoomLevelLabel(currentZoomLevel) }}
          </span>
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
                  {{ getNodeTypeConfig(primarySelectedNode.type).icon }}
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

            <!-- Resource Storage -->
            <div>
              <p class="text-xs text-gray-500 uppercase tracking-wide mb-2">Resource Storage</p>
              <div class="bg-gray-800/50 rounded p-3">
                <ResourceDisplay
                  :resources="selectedNodeStorage"
                  :max-capacity="selectedNodeCapacity"
                  :show-zero="false"
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
                      {{ amount }} {{ type }}
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
                      {{ amount }} {{ type }}
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
                {{ getNodeTypeConfig(node.type).icon }}
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
          :node-storage="selectedNodeStorage"
          @close="isTransferOpen = false; transferSourceNode = null; transferDestNode = null"
          @transfer-created="handleTransferCreated"
        />
      </div>
    </Teleport>
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
</style>
