<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { GameEngine, ZOOM_LEVELS, type ZoomLevel, type ConnectionData } from '../game';
import { NodeType, NodeStatus, RoadType, NODE_TYPE_CONFIGS, type MapNode } from '@nova-fall/shared';

const gameContainer = ref<HTMLDivElement | null>(null);
const engine = ref<GameEngine | null>(null);
const currentZoomLevel = ref<ZoomLevel>('strategic');
const showControls = ref(true);
const selectedNodeIds = ref<string[]>([]);
const allNodes = ref<MapNode[]>([]);

// Get the selected nodes data
const selectedNodes = computed(() => {
  return selectedNodeIds.value
    .map(id => allNodes.value.find(n => n.id === id))
    .filter((n): n is MapNode => n !== undefined);
});

// Primary selected node (first one for single selection display)
const primarySelectedNode = computed(() => selectedNodes.value[0] ?? null);

// Generate mock map data for testing
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
  const statuses = [NodeStatus.NEUTRAL, NodeStatus.CLAIMED, NodeStatus.NEUTRAL, NodeStatus.NEUTRAL];

  // Generate 100 nodes
  for (let i = 0; i < 100; i++) {
    const type = nodeTypes[Math.floor(random() * nodeTypes.length)] as NodeType;
    const status = statuses[Math.floor(random() * statuses.length)] as NodeStatus;
    const isClaimed = status === NodeStatus.CLAIMED;

    const node: MapNode = {
      id: `node-${i.toString().padStart(3, '0')}`,
      name: `Node ${i}`,
      type,
      tier: Math.floor(random() * 3) + 1,
      positionX: 100 + random() * 1800,
      positionY: 100 + random() * 1800,
      regionId: 'central-plains',
      ownerId: isClaimed ? 'player-1' : null,
      status,
    };

    if (isClaimed) {
      node.ownerName = 'Player One';
    }

    nodes.push(node);
  }

  // Generate connections (each node connects to 2-4 nearest neighbors)
  const connected = new Set<string>();
  for (const node of nodes) {
    const nearby = nodes
      .filter(n => n.id !== node.id)
      .map(n => ({
        node: n,
        dist: Math.sqrt((n.positionX - node.positionX) ** 2 + (n.positionY - node.positionY) ** 2),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, Math.floor(random() * 3) + 2);

    for (const { node: other } of nearby) {
      const key = [node.id, other.id].sort().join('-');
      if (connected.has(key)) continue;
      connected.add(key);

      const roadTypes = [RoadType.DIRT, RoadType.PAVED, RoadType.HIGHWAY];
      connections.push({
        fromX: node.positionX,
        fromY: node.positionY,
        toX: other.positionX,
        toY: other.positionY,
        roadType: roadTypes[Math.floor(random() * roadTypes.length)] as RoadType,
        dangerLevel: Math.floor(random() * 50),
      });
    }
  }

  return { nodes, connections };
}

onMounted(() => {
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

  // Load mock map data
  const { nodes, connections } = generateMockMapData();
  allNodes.value = nodes;
  engine.value.loadMapData(nodes, connections);
});

onUnmounted(() => {
  if (engine.value) {
    engine.value.destroy();
    engine.value = null;
  }
});

function handleZoomIn() {
  engine.value?.zoomIn();
}

function handleZoomOut() {
  engine.value?.zoomOut();
}

function handleResetView() {
  engine.value?.panTo(1000, 1000, true);
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

function handleFocusNode() {
  if (primarySelectedNode.value) {
    engine.value?.panTo(primarySelectedNode.value.positionX, primarySelectedNode.value.positionY, true);
    engine.value?.setZoomLevel('node');
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

        <div class="flex items-center gap-2">
          <button
            class="rounded bg-gray-800 px-3 py-1 text-sm text-gray-300 hover:bg-gray-700"
            @click="showControls = !showControls"
          >
            {{ showControls ? 'Hide Controls' : 'Show Controls' }}
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
                <div>
                  <h3 class="text-lg font-medium text-white">{{ primarySelectedNode.name }}</h3>
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

            <!-- Resource Storage (placeholder) -->
            <div>
              <p class="text-xs text-gray-500 uppercase tracking-wide mb-2">Resource Storage</p>
              <div class="bg-gray-800/50 rounded p-3 text-center text-gray-500 text-sm">
                No resources stored
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
