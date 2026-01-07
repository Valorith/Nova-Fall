<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { GameEngine, ZOOM_LEVELS, type ZoomLevel, type ConnectionData } from '../game';
import { NodeType, NodeStatus, RoadType, NODE_TYPE_CONFIGS, STARTING_RESOURCES, NODE_BASE_STORAGE, type MapNode, type ResourceStorage } from '@nova-fall/shared';
import PlayerResourcesPanel from '@/components/game/PlayerResourcesPanel.vue';
import ResourceDisplay from '@/components/game/ResourceDisplay.vue';
import NodeTooltip from '@/components/game/NodeTooltip.vue';
import { useGameStore } from '@/stores/game';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { nodesApi } from '@/services/api';
import { hexToPixel, hexKey, hexNeighbors, type HexCoord } from '../game/utils/hexGrid';

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

// Get storage for the selected node
const selectedNodeStorage = computed(() => {
  if (!primarySelectedNode.value) return {};
  return nodeStorage.value[primarySelectedNode.value.id] ?? {};
});

// Get storage capacity for the selected node
const selectedNodeCapacity = computed(() => {
  if (!primarySelectedNode.value) return 0;
  return NODE_BASE_STORAGE[primarySelectedNode.value.type] ?? 10000;
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
    selectedNodeIds.value = ids;
  };

  // Listen for node hover (for tooltip)
  engine.value.onNodeHover = (node, screenX, screenY) => {
    hoveredNode.value = node;
    tooltipX.value = screenX;
    tooltipY.value = screenY;
  };

  // Load map data - use mock data if API not available or useMockData is true
  if (useMockData.value) {
    const { nodes, connections } = generateMockMapData();
    // Store mock nodes in the game store (batch load to avoid triggering updates)
    gameStore.loadNodesBatch(nodes);
    engine.value.loadMapData(nodes, connections);

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
      // Connect to WebSocket for real-time updates
      gameStore.connectSocket();

      // Load from API with session scope
      await gameStore.loadMapData(props.sessionId);
      engine.value.loadMapData(gameStore.nodeList, gameStore.connections);
    } catch (err) {
      console.warn('Failed to load from API, falling back to mock data:', err);
      // Fallback to mock data
      const { nodes, connections } = generateMockMapData();
      gameStore.loadNodesBatch(nodes);
      engine.value.loadMapData(nodes, connections);
    }
  }
});

onUnmounted(() => {
  // Disconnect from WebSocket
  gameStore.disconnectSocket();

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

// Check if the selected node can be claimed
const canClaimNode = computed(() => {
  if (!primarySelectedNode.value) return false;
  if (!authStore.isAuthenticated) return false;
  if (useMockData.value) return false; // Can't claim with mock data
  return primarySelectedNode.value.status === NodeStatus.NEUTRAL;
});

// Claim a node
async function handleClaimNode() {
  if (!primarySelectedNode.value || isClaiming.value) return;

  isClaiming.value = true;

  try {
    const response = await nodesApi.claim(primarySelectedNode.value.id);
    const { node } = response.data;

    // Update the node in the store
    if (node) {
      gameStore.setNode(node);
      // Update in the renderer
      engine.value?.updateNode(node.id, node);
      toastStore.success(`Claimed ${node.name}!`);
    }
  } catch (err) {
    const error = err as { response?: { data?: { error?: string; message?: string } } };
    const message = error.response?.data?.message || error.response?.data?.error || 'Failed to claim node';
    toastStore.error(message);
  } finally {
    isClaiming.value = false;
  }
}
</script>

<template>
  <div class="relative h-screen w-screen overflow-hidden bg-gray-950">
    <!-- Game Canvas Container -->
    <div ref="gameContainer" class="absolute inset-0" />

    <!-- UI Overlay -->
    <div class="pointer-events-none absolute inset-0">
      <!-- Top Bar -->
      <div class="pointer-events-auto flex items-center justify-between bg-gray-900/80 px-4 py-2 backdrop-blur-sm">
        <div class="flex items-center gap-4">
          <h1 class="text-lg font-bold text-white">Nova Fall</h1>
          <span class="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300">
            {{ getZoomLevelLabel(currentZoomLevel) }}
          </span>
        </div>

        <!-- Player Resources -->
        <PlayerResourcesPanel :resources="playerResources" />

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
