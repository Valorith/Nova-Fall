<script setup lang="ts">
import { ref, computed, watch, onMounted, markRaw, nextTick, provide } from 'vue';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import type { Node, Edge, Connection } from '@vue-flow/core';
import { MiniMap } from '@vue-flow/minimap';
import { Controls } from '@vue-flow/controls';
import { Background } from '@vue-flow/background';
import { useRefHistory } from '@vueuse/core';
import type { DbAIPreset, BehaviorTree, BehaviorNodeType, ValidationIssue } from '@nova-fall/shared';
import { aiPresetsApi } from '@/services/api';
import { autoArrangeNodes } from '@/components/ai-editor/utils/autoLayout';
import { calculateExecutionOrder, getPathToNode, getDescendants } from '@/components/ai-editor/utils/executionOrder';
import { unchainSequenceEdges, chainEdgesForDisplay, unchainEdgesForSave } from '@/components/ai-editor/utils/sequenceChaining';

// Custom node components
import SelectorNode from '@/components/ai-editor/nodes/SelectorNode.vue';
import SequenceNode from '@/components/ai-editor/nodes/SequenceNode.vue';
import ParallelNode from '@/components/ai-editor/nodes/ParallelNode.vue';
import DecoratorNode from '@/components/ai-editor/nodes/DecoratorNode.vue';
import ConditionNode from '@/components/ai-editor/nodes/ConditionNode.vue';
import ActionNode from '@/components/ai-editor/nodes/ActionNode.vue';
import NodePropertiesPanel from '@/components/ai-editor/NodePropertiesPanel.vue';
import LogicDescriptionPanel from '@/components/ai-editor/LogicDescriptionPanel.vue';

// Vue Flow imports for styles
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/minimap/dist/style.css';
import '@vue-flow/controls/dist/style.css';

// Custom node types registry - use markRaw to prevent reactivity issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: Record<string, any> = {
  selector: markRaw(SelectorNode),
  sequence: markRaw(SequenceNode),
  parallel: markRaw(ParallelNode),
  inverter: markRaw(DecoratorNode),
  succeeder: markRaw(DecoratorNode),
  repeater: markRaw(DecoratorNode),
  until_fail: markRaw(DecoratorNode),
  condition: markRaw(ConditionNode),
  action: markRaw(ActionNode),
};

// Props for navigating from other editors
interface Props {
  initialPresetId?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  initialPresetId: null,
});

const emit = defineEmits<(e: 'preset-loaded') => void>();

// Types
type AIPresetCategory = 'unit' | 'building';

// Extended preset type with linkedCount and linked definitions
interface LinkedDefinition {
  id: string;
  name: string;
}

interface AIPresetWithCount extends DbAIPreset {
  linkedCount?: number;
  unitDefinitions?: LinkedDefinition[];
  buildingDefinitions?: LinkedDefinition[];
}

// State
const presets = ref<AIPresetWithCount[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const selectedPreset = ref<AIPresetWithCount | null>(null);
const isEditing = ref(false);
const isCreating = ref(false);
const saving = ref(false);

// Filters
const searchQuery = ref('');
const filterCategory = ref<AIPresetCategory | ''>('');
const includeTemplates = ref(true);

// Form state for preset metadata
const form = ref({
  name: '',
  description: '',
  category: 'unit' as AIPresetCategory,
});

// Vue Flow state
const { nodes, edges, fitView, setNodes, setEdges, addNodes, addEdges, removeNodes, project, onConnect, onNodesInitialized, onPaneReady } = useVueFlow();

// Selected node for properties panel
const selectedNodeId = ref<string | null>(null);

// Execution order toggle
const showExecutionOrder = ref(true);

// Flow highlighting - track hovered node for path highlighting
const hoveredNodeId = ref<string | null>(null);

// Flag to skip edge validation during programmatic loading
// Vue Flow calls isValidConnection even for setEdges, so we need to bypass validation during loading
const isLoadingEdges = ref(false);

// Collapsed subtrees - track which composite nodes are collapsed
const collapsedNodes = ref<Set<string>>(new Set());

// Toggle collapse state for a node
function toggleNodeCollapse(nodeId: string) {
  const newSet = new Set(collapsedNodes.value);
  if (newSet.has(nodeId)) {
    newSet.delete(nodeId);
  } else {
    newSet.add(nodeId);
  }
  collapsedNodes.value = newSet;
}

// Provide toggle function for custom nodes to use
provide('toggleNodeCollapse', toggleNodeCollapse);

// Drag state for palette
const isDragging = ref(false);
const dragNodeType = ref<BehaviorNodeType | null>(null);

// Node counter for unique IDs
let nodeIdCounter = 0;

// Component instance ID for debugging (detect HMR multiple instances)
const instanceId = Math.random().toString(36).substring(2, 8);
console.log(`[AIEditor:${instanceId}] Component instance created`);

// Handle nodes initialized event - log for debugging
// onNodesInitialized fires when node dimensions are set, but Handle components may not be mounted yet
onNodesInitialized(() => {
  console.log(`[AIEditor:${instanceId}] onNodesInitialized fired`);
});

// Handle pane ready event - log when Vue Flow is fully initialized
onPaneReady(() => {
  console.log(`[AIEditor:${instanceId}] onPaneReady fired`);
});

// Clipboard for copy/paste
const clipboard = ref<{ nodes: Node[]; edges: Edge[] } | null>(null);

// Tree state for undo/redo (serialized form)
const treeState = ref<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });
const { undo, redo, canUndo, canRedo } = useRefHistory(treeState, {
  capacity: 50,
  deep: true,
});

// Validation state
const validationIssues = ref<ValidationIssue[]>([]);
const isTreeValid = computed(() => validationIssues.value.filter((i) => i.severity === 'error').length === 0);

// Generate unique node ID
function generateNodeId(): string {
  return `node_${Date.now()}_${nodeIdCounter++}`;
}

// Generate unique edge ID
function generateEdgeId(source: string, target: string): string {
  return `edge_${source}_${target}_${Date.now()}`;
}

// Computed: selected node data
const selectedNode = computed(() => {
  if (!selectedNodeId.value) return null;
  return nodes.value.find((n) => n.id === selectedNodeId.value) || null;
});

// Computed: execution order for all nodes
const executionOrder = computed(() => {
  if (!showExecutionOrder.value) return new Map<string, number>();
  return calculateExecutionOrder(nodes.value, edges.value);
});

// Computed: highlighted path (from root to hovered node)
const highlightedPath = computed(() => {
  if (!hoveredNodeId.value) return new Set<string>();
  const path = getPathToNode(hoveredNodeId.value, edges.value);
  return new Set(path);
});

// Computed: highlighted edge IDs
const highlightedEdges = computed(() => {
  if (!hoveredNodeId.value) return new Set<string>();
  const edgeIds = new Set<string>();
  for (const edge of edges.value) {
    if (highlightedPath.value.has(edge.source) && highlightedPath.value.has(edge.target)) {
      edgeIds.add(edge.id);
    }
  }
  return edgeIds;
});

// Computed: hidden node IDs (descendants of collapsed nodes)
const hiddenNodeIds = computed(() => {
  const hidden = new Set<string>();
  for (const collapsedId of collapsedNodes.value) {
    const descendants = getDescendants(collapsedId, edges.value);
    for (const descendantId of descendants) {
      hidden.add(descendantId);
    }
  }
  return hidden;
});

// Computed: subtree counts for collapsed nodes
const subtreeCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const collapsedId of collapsedNodes.value) {
    const descendants = getDescendants(collapsedId, edges.value);
    counts.set(collapsedId, descendants.size);
  }
  return counts;
});

// Categories
const categories: AIPresetCategory[] = ['unit', 'building'];

const categoryNames: Record<AIPresetCategory, string> = {
  unit: 'Unit',
  building: 'Building',
};

const categoryColors: Record<AIPresetCategory, string> = {
  unit: '#22c55e',
  building: '#3b82f6',
};

// Fetch presets
async function fetchPresets() {
  loading.value = true;
  error.value = null;
  try {
    const query: {
      category?: AIPresetCategory;
      includeTemplates?: boolean;
      search?: string;
      limit?: number;
    } = {
      limit: 100,
      includeTemplates: includeTemplates.value,
    };
    if (searchQuery.value) query.search = searchQuery.value;
    if (filterCategory.value) query.category = filterCategory.value;

    const response = await aiPresetsApi.getAll(query);
    presets.value = response.data.presets;
    total.value = response.data.total;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load AI presets';
    console.error('Failed to load AI presets:', err);
  } finally {
    loading.value = false;
  }
}

// Watch filters
watch([searchQuery, filterCategory, includeTemplates], fetchPresets);

// Watch execution order, highlighting, and collapse state to update node/edge data
watch(
  [executionOrder, highlightedPath, hoveredNodeId, collapsedNodes, hiddenNodeIds, subtreeCounts],
  () => {
    // Update nodes with execution order, dimmed state, and collapse info
    for (const node of nodes.value) {
      const order = executionOrder.value.get(node.id);
      const isDimmed = hoveredNodeId.value !== null && !highlightedPath.value.has(node.id);
      const isCollapsed = collapsedNodes.value.has(node.id);
      const isHidden = hiddenNodeIds.value.has(node.id);
      const subtreeCount = subtreeCounts.value.get(node.id) ?? 0;

      // Only update if values changed to avoid unnecessary reactivity
      if (
        node.data.executionOrder !== order ||
        node.data.dimmed !== isDimmed ||
        node.data.collapsed !== isCollapsed ||
        node.data.subtreeCount !== subtreeCount
      ) {
        node.data = {
          ...node.data,
          executionOrder: order,
          dimmed: isDimmed,
          collapsed: isCollapsed,
          subtreeCount: subtreeCount,
        };
      }

      // Update node hidden state (Vue Flow uses 'hidden' property)
      if (node.hidden !== isHidden) {
        node.hidden = isHidden;
      }
    }

    // Update edge visibility and styles
    for (const edge of edges.value) {
      // Hide edges connected to hidden nodes
      const sourceHidden = hiddenNodeIds.value.has(edge.source);
      const targetHidden = hiddenNodeIds.value.has(edge.target);
      const shouldHideEdge = sourceHidden || targetHidden;

      if (edge.hidden !== shouldHideEdge) {
        edge.hidden = shouldHideEdge;
      }

      // Update edge styles for highlighting (only for visible edges)
      if (!shouldHideEdge) {
        if (hoveredNodeId.value) {
          const isHighlighted = highlightedEdges.value.has(edge.id);
          edge.style = isHighlighted
            ? { stroke: '#60a5fa', strokeWidth: 3 }
            : { stroke: '#4b5563', strokeWidth: 1, opacity: 0.3 };
        } else {
          // Reset to default when not hovering
          edge.style = { stroke: '#4b5563' };
        }
      }
    }
  },
  { immediate: true }
);

// Reset filters
function resetFilters() {
  searchQuery.value = '';
  filterCategory.value = '';
  includeTemplates.value = true;
}

// Select preset
async function selectPreset(preset: DbAIPreset) {
  console.log(`[AIEditor:${instanceId}] selectPreset called: "${preset.name}" (${preset.id})`);

  isEditing.value = false;
  isCreating.value = false;
  selectedNodeId.value = null;

  // Fetch full preset details including linked definitions
  try {
    const response = await aiPresetsApi.getById(preset.id);
    selectedPreset.value = response.data;
    console.log(`[AIEditor:${instanceId}] Fetched preset from API:`, {
      name: response.data.name,
      nodeCount: (response.data.treeData as BehaviorTree)?.nodes?.length ?? 0,
    });
  } catch (err) {
    // Fallback to basic preset data if fetch fails
    selectedPreset.value = preset;
    console.error(`[AIEditor:${instanceId}] Failed to fetch preset details:`, err);
  }

  // Load tree into Vue Flow - use selectedPreset.value which has fresh data from API
  if (!selectedPreset.value) return;
  const tree = selectedPreset.value.treeData as BehaviorTree;
  await loadTreeIntoCanvas(tree, 'selectPreset');
}

// Load behavior tree into Vue Flow canvas
async function loadTreeIntoCanvas(tree: BehaviorTree, source = 'unknown') {
  // Don't reload during auto-arrange - canvas already has correct positions
  if (isAutoArranging.value) {
    console.log(`[AIEditor:${instanceId}] LoadTree SKIPPED - auto-arrange in progress (source: ${source})`);
    return;
  }

  console.log(`[AIEditor:${instanceId}] LoadTree START (source: ${source})`);

  // Clear collapsed state when loading new tree
  collapsedNodes.value = new Set();

  // Clear existing nodes and edges first
  setNodes([]);
  setEdges([]);

  // Wait for Vue Flow to process the clear before setting new nodes
  // This prevents node mixing when switching presets rapidly
  await nextTick();

  if (!tree || !tree.nodes) {
    console.log(`[AIEditor:${instanceId}] LoadTree - no tree or nodes`);
    return;
  }

  console.log(`[AIEditor:${instanceId}] LoadTree - ${tree.nodes.length} nodes from API:`);
  tree.nodes.forEach((n) => {
    console.log(`  ${n.label} [${n.id}]: (${n.position.x}, ${n.position.y})`);
  });

  // Convert behavior nodes to Vue Flow nodes with custom types
  const vfNodes: Node[] = tree.nodes.map((node) => {
    // Extract conditionId/actionId from params if present (for DB-stored presets)
    const params = node.params || {};
    const conditionId = params.conditionId as string | undefined;
    const actionId = params.actionId as string | undefined;

    // Remove conditionId/actionId from params since they go at top level of data
    const cleanParams = { ...params };
    delete cleanParams.conditionId;
    delete cleanParams.actionId;

    return {
      id: node.id,
      type: node.type, // Use the actual node type for custom component
      position: { x: node.position.x, y: node.position.y }, // Ensure new object
      data: {
        label: node.label,
        type: node.type,
        params: cleanParams,
        // Restore conditionId/actionId at top level for validation
        ...(conditionId && { conditionId }),
        ...(actionId && { actionId }),
      },
    };
  });

  // Convert behavior edges to Vue Flow edges
  const rawEdges: Edge[] = tree.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    animated: true,
    style: { stroke: '#4b5563' },
    type: 'smoothstep',
  }));

  // Chain Sequence edges for visual display:
  // Instead of Sequence → [A, B, C], show Sequence → A → B → C
  // This makes the execution flow more intuitive
  const vfEdges = chainEdgesForDisplay(vfNodes, rawEdges);

  console.log(`[AIEditor:${instanceId}] LoadTree - setting ${vfNodes.length} nodes, ${vfEdges.length} edges`);

  // Set nodes first, then edges after a brief delay to ensure nodes are initialized
  setNodes(vfNodes);

  // Log the edges we're about to set
  console.log(`[AIEditor:${instanceId}] LoadTree - edges to set:`, vfEdges.map(e => `${e.source}->${e.target}`));

  // Use nextTick to ensure nodes are in the DOM before setting edges
  // Set isLoadingEdges flag to bypass validation for chain edges
  nextTick(() => {
    isLoadingEdges.value = true;
    setEdges(vfEdges);
    isLoadingEdges.value = false;
    console.log(`[AIEditor:${instanceId}] LoadTree - edge count after setEdges: ${edges.value.length}`);

    // Fit view after loading
    setTimeout(() => fitView({ padding: 0.2 }), 50);
  });
}

// Get node color based on type
function getNodeColor(type: string): string {
  const colors: Record<string, string> = {
    selector: '#f59e0b',
    sequence: '#3b82f6',
    parallel: '#a855f7',
    inverter: '#eab308',
    succeeder: '#eab308',
    repeater: '#eab308',
    until_fail: '#eab308',
    condition: '#06b6d4',
    action: '#22c55e',
  };
  return colors[type] || '#6b7280';
}

// Handle node selection
function onNodeClick(event: { node: { id: string } }) {
  selectedNodeId.value = event.node.id;
}

// Handle canvas click (deselect)
function onPaneClick() {
  selectedNodeId.value = null;
}

// Get default label for node type
function getDefaultLabel(type: BehaviorNodeType): string {
  const labels: Record<BehaviorNodeType, string> = {
    selector: 'Selector',
    sequence: 'Sequence',
    parallel: 'Parallel',
    inverter: 'Inverter',
    succeeder: 'Succeeder',
    repeater: 'Repeater',
    until_fail: 'Until Fail',
    condition: 'Condition',
    action: 'Action',
  };
  return labels[type] || type;
}

// Palette drag handlers
function onDragStart(event: DragEvent, type: BehaviorNodeType) {
  if (!event.dataTransfer) return;

  isDragging.value = true;
  dragNodeType.value = type;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/vueflow', type);
}

function onDragEnd() {
  isDragging.value = false;
  dragNodeType.value = null;
}

// Canvas drop handler
function onDrop(event: DragEvent) {
  if (!event.dataTransfer) return;

  const type = event.dataTransfer.getData('application/vueflow') as BehaviorNodeType;
  if (!type) return;

  // Get drop position relative to canvas
  const { left, top } = (event.target as HTMLElement).getBoundingClientRect();
  const position = project({
    x: event.clientX - left,
    y: event.clientY - top,
  });

  // Create new node
  const newNode: Node = {
    id: generateNodeId(),
    type,
    position,
    data: {
      label: getDefaultLabel(type),
      type,
      params: {},
    },
  };

  addNodes([newNode]);

  isDragging.value = false;
  dragNodeType.value = null;
}

function onDragOver(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

// Connection validation - determine if connection is valid
function isValidConnection(connection: Connection): boolean {
  // Skip validation during programmatic loading (e.g., setEdges for chained sequence display)
  if (isLoadingEdges.value) {
    return true;
  }

  const sourceNode = nodes.value.find((n) => n.id === connection.source);
  const targetNode = nodes.value.find((n) => n.id === connection.target);

  if (!sourceNode || !targetNode) return false;

  const sourceType = sourceNode.data.type as BehaviorNodeType;

  // Leaf nodes (condition, action) cannot have children (for user-initiated connections)
  // Note: Programmatic chain edges bypass this via isLoadingEdges flag
  const leafTypes: BehaviorNodeType[] = ['condition', 'action'];
  if (leafTypes.includes(sourceType)) {
    return false;
  }

  // Decorators can only have one child
  const decoratorTypes: BehaviorNodeType[] = ['inverter', 'succeeder', 'repeater', 'until_fail'];
  if (decoratorTypes.includes(sourceType)) {
    const existingChildren = edges.value.filter((e) => e.source === connection.source);
    if (existingChildren.length >= 1) {
      return false;
    }
  }

  // Prevent self-connections
  if (connection.source === connection.target) {
    return false;
  }

  // Prevent duplicate connections
  const exists = edges.value.some(
    (e) => e.source === connection.source && e.target === connection.target
  );
  if (exists) {
    return false;
  }

  return true;
}

// Handle new connections
onConnect((connection) => {
  if (!isValidConnection(connection)) return;

  const newEdge: Edge = {
    id: generateEdgeId(connection.source, connection.target),
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? null,
    targetHandle: connection.targetHandle ?? null,
    animated: true,
    style: { stroke: '#4b5563' },
    type: 'smoothstep',
  };

  addEdges([newEdge]);
  saveTreeState();
  validateTree();
});

// ==================== TREE VALIDATION ====================

function validateTree() {
  const issues: ValidationIssue[] = [];

  // Check for empty tree
  if (nodes.value.length === 0) {
    validationIssues.value = [];
    return;
  }

  // Check for root node (node with no incoming edges)
  const nodesWithIncoming = new Set(edges.value.map((e) => e.target));
  const rootCandidates = nodes.value.filter((n) => !nodesWithIncoming.has(n.id));

  if (rootCandidates.length === 0) {
    issues.push({
      message: 'No root node found. Tree must have exactly one root.',
      severity: 'error',
    });
  } else if (rootCandidates.length > 1) {
    issues.push({
      message: `Multiple root nodes found (${rootCandidates.length}). Tree must have exactly one root.`,
      severity: 'error',
    });
    rootCandidates.forEach((n) => {
      issues.push({
        nodeId: n.id,
        message: `Node "${n.data.label}" has no parent`,
        severity: 'warning',
      });
    });
  }

  // Check for disconnected nodes
  const connectedNodeIds = new Set<string>();
  if (rootCandidates.length === 1) {
    const root = rootCandidates[0];
    if (!root) return;
    connectedNodeIds.add(root.id);
    const queue = [root.id];

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (!nodeId) continue;
      const childEdges = edges.value.filter((e) => e.source === nodeId);
      for (const edge of childEdges) {
        if (!connectedNodeIds.has(edge.target)) {
          connectedNodeIds.add(edge.target);
          queue.push(edge.target);
        }
      }
    }

    const disconnected = nodes.value.filter((n) => !connectedNodeIds.has(n.id));
    if (disconnected.length > 0) {
      issues.push({
        message: `${disconnected.length} disconnected node(s) found`,
        severity: 'warning',
      });
    }
  }

  // Check decorator children
  const decoratorTypes: BehaviorNodeType[] = ['inverter', 'succeeder', 'repeater', 'until_fail'];
  for (const node of nodes.value) {
    const nodeType = node.data.type as BehaviorNodeType;
    if (decoratorTypes.includes(nodeType)) {
      const childCount = edges.value.filter((e) => e.source === node.id).length;
      if (childCount === 0) {
        issues.push({
          nodeId: node.id,
          message: `Decorator "${node.data.label}" has no child`,
          severity: 'error',
        });
      } else if (childCount > 1) {
        issues.push({
          nodeId: node.id,
          message: `Decorator "${node.data.label}" has ${childCount} children (max 1)`,
          severity: 'error',
        });
      }
    }
  }

  // Check leaf nodes don't have children (excluding visual chain edges)
  // Chain edges connect siblings within a Sequence for visual clarity - they're not real parent-child relationships
  const leafTypes: BehaviorNodeType[] = ['condition', 'action'];
  const leafNodeIds = new Set(
    nodes.value.filter((n) => leafTypes.includes(n.data.type as BehaviorNodeType)).map((n) => n.id)
  );
  for (const node of nodes.value) {
    const nodeType = node.data.type as BehaviorNodeType;
    if (leafTypes.includes(nodeType)) {
      // Count only edges that go to non-leaf nodes (real children, not chain siblings)
      const realChildCount = edges.value.filter(
        (e) => e.source === node.id && !leafNodeIds.has(e.target)
      ).length;
      if (realChildCount > 0) {
        issues.push({
          nodeId: node.id,
          message: `Leaf node "${node.data.label}" cannot have children`,
          severity: 'error',
        });
      }

      // Check if condition/action has definition selected
      if (nodeType === 'condition' && !node.data.conditionId) {
        issues.push({
          nodeId: node.id,
          message: `Condition "${node.data.label}" has no condition type selected`,
          severity: 'warning',
        });
      }
      if (nodeType === 'action' && !node.data.actionId) {
        issues.push({
          nodeId: node.id,
          message: `Action "${node.data.label}" has no action type selected`,
          severity: 'warning',
        });
      }
    }
  }

  validationIssues.value = issues;
}

// Watch for changes and validate
watch([nodes, edges], validateTree, { deep: true });

// ==================== UNDO/REDO ====================

function saveTreeState() {
  treeState.value = {
    nodes: JSON.parse(JSON.stringify(nodes.value)),
    edges: JSON.parse(JSON.stringify(edges.value)),
  };
}

function performUndo() {
  if (!canUndo.value) return;
  undo();
  restoreTreeState();
}

function performRedo() {
  if (!canRedo.value) return;
  redo();
  restoreTreeState();
}

function restoreTreeState() {
  setNodes(treeState.value.nodes);
  setEdges(treeState.value.edges);
}

// ==================== COPY/PASTE/DUPLICATE ====================

function copySelectedNodes() {
  if (!selectedNodeId.value) return;

  const selectedNode = nodes.value.find((n) => n.id === selectedNodeId.value);
  if (!selectedNode) return;

  // Copy single selected node (could extend to multi-select later)
  clipboard.value = {
    nodes: [JSON.parse(JSON.stringify(selectedNode))],
    edges: [],
  };
}

function pasteNodes() {
  if (!clipboard.value || clipboard.value.nodes.length === 0) return;

  const offset = { x: 50, y: 50 };
  const idMap = new Map<string, string>();

  // Create new nodes with new IDs and offset positions
  const newNodes: Node[] = clipboard.value.nodes.map((node) => {
    const newId = generateNodeId();
    idMap.set(node.id, newId);
    return {
      ...node,
      id: newId,
      position: {
        x: node.position.x + offset.x,
        y: node.position.y + offset.y,
      },
      data: { ...node.data },
    };
  });

  // Remap edge IDs if copying edges
  const newEdges: Edge[] = clipboard.value.edges.map((edge) => ({
    ...edge,
    id: generateEdgeId(idMap.get(edge.source) || edge.source, idMap.get(edge.target) || edge.target),
    source: idMap.get(edge.source) || edge.source,
    target: idMap.get(edge.target) || edge.target,
  }));

  addNodes(newNodes);
  if (newEdges.length > 0) {
    addEdges(newEdges);
  }

  // Select the first pasted node
  if (newNodes.length > 0 && newNodes[0]) {
    selectedNodeId.value = newNodes[0].id;
  }

  saveTreeState();
  validateTree();
}

function duplicateSelectedNodes() {
  if (!selectedNodeId.value) return;

  const selectedNode = nodes.value.find((n) => n.id === selectedNodeId.value);
  if (!selectedNode) return;

  const offset = { x: 50, y: 50 };
  const newId = generateNodeId();

  const newNode: Node = {
    ...JSON.parse(JSON.stringify(selectedNode)),
    id: newId,
    position: {
      x: selectedNode.position.x + offset.x,
      y: selectedNode.position.y + offset.y,
    },
  };

  addNodes([newNode]);
  selectedNodeId.value = newId;

  saveTreeState();
  validateTree();
}

// ==================== AUTO-LAYOUT ====================

const isAutoArranging = ref(false);

async function autoLayoutTree() {
  if (nodes.value.length === 0) {
    console.log(`[AIEditor:${instanceId}] AutoLayout SKIPPED - no nodes`);
    return;
  }
  if (isAutoArranging.value) {
    console.log(`[AIEditor:${instanceId}] AutoLayout SKIPPED - already in progress`);
    return;
  }

  console.log(`[AIEditor:${instanceId}] AutoLayout START - ${nodes.value.length} nodes`);
  isAutoArranging.value = true;

  // Show immediate feedback that auto-arrange started
  successMessage.value = 'Arranging nodes...';

  // Save current state for undo
  saveTreeState();

  // Log current positions before layout
  console.log(`[AIEditor:${instanceId}] AutoLayout - BEFORE positions:`);
  nodes.value.forEach((n) => {
    console.log(`  ${n.data.label} [${n.id}]: (${n.position.x}, ${n.position.y})`);
  });

  // Use dagre-based layout algorithm with dynamic node widths
  // Node widths are calculated based on label length to prevent overlap
  const arrangedNodes = autoArrangeNodes(nodes.value, edges.value, {
    direction: 'TB',
    nodeHeight: 50,
    horizontalSpacing: 50,
    verticalSpacing: 60,
  });

  // Log positions after layout
  console.log(`[AIEditor:${instanceId}] AutoLayout - AFTER dagre positions:`);
  arrangedNodes.forEach((n) => {
    console.log(`  ${n.data.label} [${n.id}]: (${n.position.x}, ${n.position.y})`);
  });

  // Store current edges before clearing (with fresh data)
  const currentEdges: Edge[] = edges.value.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    animated: true,
    style: { stroke: '#4b5563' },
    type: 'smoothstep',
  }));

  // Clear and re-set nodes and edges to force Vue Flow to recalculate paths
  setNodes([]);
  setEdges([]);

  // Use nextTick to ensure Vue Flow processes the clear before setting new values
  await nextTick();

  // Create fresh copies of nodes to ensure Vue Flow doesn't reference stale objects
  const freshNodes: Node[] = arrangedNodes.map((n) => ({
    id: n.id,
    type: n.type ?? 'default',
    position: { x: n.position.x, y: n.position.y },
    data: { ...n.data },
  }));

  console.log(`[AIEditor:${instanceId}] AutoLayout - ${freshNodes.length} nodes, ${currentEdges.length} edges`);

  // Set nodes first
  setNodes(freshNodes);

  // Use nextTick to ensure nodes are in the DOM before setting edges
  // Use isLoadingEdges flag to bypass validation for chain edges
  nextTick(() => {
    isLoadingEdges.value = true;
    setEdges(currentEdges);
    isLoadingEdges.value = false;
    console.log(`[AIEditor:${instanceId}] AutoLayout - edge count after setEdges: ${edges.value.length}`);

    // Fit viewport to show all nodes after layout settles
    setTimeout(() => fitView({ padding: 0.2 }), 50);
  });

  // Auto-save the new positions for any selected preset (including templates)
  if (selectedPreset.value) {
    try {
      await saveTreePositionsWithNodes(freshNodes, currentEdges);
    } catch (err) {
      console.error(`[AIEditor:${instanceId}] AutoLayout save failed:`, err);
      successMessage.value = null;
      error.value = err instanceof Error ? err.message : 'Failed to save layout';
    }
  } else {
    successMessage.value = null;
  }

  console.log(`[AIEditor:${instanceId}] AutoLayout COMPLETE`);
  isAutoArranging.value = false;
}

// Save tree positions with explicit node/edge data (used by auto-arrange)
async function saveTreePositionsWithNodes(nodeList: Node[], edgeList: Edge[]) {
  if (!selectedPreset.value) {
    console.log(`[AIEditor:${instanceId}] SaveTree SKIPPED - no selectedPreset`);
    return;
  }

  const presetId = selectedPreset.value.id;
  const presetName = selectedPreset.value.name;

  console.log(`[AIEditor:${instanceId}] SaveTree START for "${presetName}" (${presetId})`);
  console.log(`[AIEditor:${instanceId}] SaveTree - ${nodeList.length} nodes to save:`);
  nodeList.forEach((n) => {
    console.log(`  ${n.data.label} [${n.id}]: (${n.position.x}, ${n.position.y})`);
  });

  saving.value = true;
  error.value = null;

  try {
    // Find the root node (node with no incoming edges)
    const nodesWithIncoming = new Set(edgeList.map((e) => e.target));
    const rootNode = nodeList.find((n) => !nodesWithIncoming.has(n.id));
    const rootId = rootNode?.id ?? nodeList[0]?.id ?? '';

    // Unchain Sequence edges before saving to database
    // Display uses chained format (A → B → C), but DB stores standard format (Parent → [A, B, C])
    const unchainedEdges = unchainEdgesForSave(nodeList, edgeList);

    const treeData: BehaviorTree = {
      version: 1,
      category: selectedPreset.value.category as 'unit' | 'building',
      nodes: nodeList.map((n) => ({
        id: n.id,
        type: n.data.type,
        label: n.data.label,
        params: {
          ...(n.data.params || {}),
          // Include conditionId/actionId in params for DB persistence
          ...(n.data.conditionId && { conditionId: n.data.conditionId }),
          ...(n.data.actionId && { actionId: n.data.actionId }),
        },
        position: { x: n.position.x, y: n.position.y }, // Ensure clean copy
      })),
      edges: unchainedEdges.map((e) => {
        const edge: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string } = {
          id: e.id,
          source: e.source,
          target: e.target,
        };
        if (e.sourceHandle) edge.sourceHandle = e.sourceHandle;
        if (e.targetHandle) edge.targetHandle = e.targetHandle;
        return edge;
      }),
      rootId,
    };

    const data = {
      name: selectedPreset.value.name,
      description: selectedPreset.value.description || null,
      category: selectedPreset.value.category,
      treeData,
    };

    console.log(`[AIEditor:${instanceId}] SaveTree - sending to API...`);
    const response = await aiPresetsApi.update(presetId, data);

    // Verify the API response contains correct positions
    const savedTree = response.data.treeData as BehaviorTree;
    console.log(`[AIEditor:${instanceId}] SaveTree SUCCESS - API returned ${savedTree.nodes.length} nodes:`);
    savedTree.nodes.forEach((n) => {
      console.log(`  ${n.label} [${n.id}]: (${n.position.x}, ${n.position.y})`);
    });

    // Update the local preset with saved data to keep in sync
    // This ensures that if the user navigates away and back, we have the correct data
    if (selectedPreset.value && selectedPreset.value.id === presetId) {
      selectedPreset.value = response.data;
    }

    // Show success message
    successMessage.value = 'Layout saved!';
    setTimeout(() => {
      successMessage.value = null;
    }, 2000);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save positions';
    console.error(`[AIEditor:${instanceId}] SaveTree FAILED:`, err);
  } finally {
    saving.value = false;
  }
}

// Keyboard shortcuts
function handleKeydown(event: KeyboardEvent) {
  // Only handle when canvas is active
  if (!selectedPreset.value && !isCreating.value) return;

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const ctrlKey = isMac ? event.metaKey : event.ctrlKey;

  // Undo: Ctrl+Z
  if (ctrlKey && event.key === 'z' && !event.shiftKey) {
    event.preventDefault();
    performUndo();
  }
  // Redo: Ctrl+Shift+Z or Ctrl+Y
  else if ((ctrlKey && event.key === 'z' && event.shiftKey) || (ctrlKey && event.key === 'y')) {
    event.preventDefault();
    performRedo();
  }
  // Delete: Delete or Backspace
  else if (event.key === 'Delete' || event.key === 'Backspace') {
    if (selectedNodeId.value && !isEditingText(event)) {
      event.preventDefault();
      handleNodeDelete(selectedNodeId.value);
    }
  }
  // Copy: Ctrl+C
  else if (ctrlKey && event.key === 'c' && !isEditingText(event)) {
    event.preventDefault();
    copySelectedNodes();
  }
  // Paste: Ctrl+V
  else if (ctrlKey && event.key === 'v' && !isEditingText(event)) {
    event.preventDefault();
    pasteNodes();
  }
  // Duplicate: Ctrl+D
  else if (ctrlKey && event.key === 'd' && !isEditingText(event)) {
    event.preventDefault();
    duplicateSelectedNodes();
  }
  // Save: Ctrl+S
  else if (ctrlKey && event.key === 's') {
    event.preventDefault();
    if (!saving.value && (selectedPreset.value && !selectedPreset.value.isTemplate)) {
      savePreset();
    }
  }
  // Auto-Arrange: Ctrl+Shift+A
  else if (ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a' && !isEditingText(event)) {
    event.preventDefault();
    autoLayoutTree();
  }
  // Escape: Deselect
  else if (event.key === 'Escape') {
    selectedNodeId.value = null;
  }
}

function isEditingText(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

// ==================== NODE PROPERTY UPDATES ====================

function handleNodeUpdate(nodeId: string, newData: Record<string, unknown>) {
  const node = nodes.value.find((n) => n.id === nodeId);
  if (!node) return;

  // Update node data directly (Vue Flow reactivity will pick it up)
  node.data = newData;
  saveTreeState();
}

function handleNodeDelete(nodeId: string) {
  // Remove the node and all connected edges
  removeNodes([nodeId]);
  selectedNodeId.value = null;
  saveTreeState();
  validateTree();
}

// Start creating new preset
function startCreate() {
  selectedPreset.value = null;
  form.value = {
    name: '',
    description: '',
    category: 'unit',
  };
  isCreating.value = true;
  isEditing.value = false;
  selectedNodeId.value = null;

  // Clear canvas and collapse state
  collapsedNodes.value = new Set();
  setNodes([]);
  setEdges([]);
}

// Start editing preset metadata
function startEdit() {
  if (!selectedPreset.value) return;
  form.value = {
    name: selectedPreset.value.name,
    description: selectedPreset.value.description || '',
    category: selectedPreset.value.category as AIPresetCategory,
  };
  isEditing.value = true;
  isCreating.value = false;
}

// Cancel editing
async function cancelEdit() {
  isEditing.value = false;
  isCreating.value = false;
  if (selectedPreset.value) {
    await loadTreeIntoCanvas(selectedPreset.value.treeData as BehaviorTree, 'cancelEdit');
  }
}

// Build tree data from current Vue Flow state
function buildTreeData(): BehaviorTree {
  // Convert nodes to BehaviorNode format
  const behaviorNodes = nodes.value.map((n) => ({
    id: n.id,
    type: n.data.type as BehaviorNodeType,
    label: n.data.label as string,
    params: {
      ...(n.data.params || {}),
      // Include conditionId/actionId in params for DB persistence
      ...(n.data.conditionId && { conditionId: n.data.conditionId }),
      ...(n.data.actionId && { actionId: n.data.actionId }),
    },
    position: n.position,
  }));

  // Convert edges and unchain Sequence edges back to standard format
  // (Child1 → Child2 chains become Sequence → [Child1, Child2])
  const behaviorEdges = edges.value.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    ...(e.sourceHandle && { sourceHandle: e.sourceHandle }),
    ...(e.targetHandle && { targetHandle: e.targetHandle }),
  }));

  const unchainedEdges = unchainSequenceEdges(behaviorNodes, behaviorEdges);

  return {
    version: 1,
    category: selectedPreset.value?.category as 'unit' | 'building' || form.value.category,
    nodes: behaviorNodes,
    edges: unchainedEdges,
    rootId: nodes.value[0]?.id ?? '',
  };
}

// Save preset
async function savePreset() {
  saving.value = true;
  error.value = null;

  try {
    // Build tree data from Vue Flow state
    const treeData = buildTreeData();
    // Override category from form when editing
    treeData.category = form.value.category;

    const data = {
      name: form.value.name,
      description: form.value.description || null,
      category: form.value.category,
      treeData,
    };

    if (isCreating.value) {
      const response = await aiPresetsApi.create(data);
      selectedPreset.value = response.data;
    } else if (selectedPreset.value) {
      const response = await aiPresetsApi.update(selectedPreset.value.id, data);
      selectedPreset.value = response.data;
    }

    isEditing.value = false;
    isCreating.value = false;
    await fetchPresets();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save preset';
    console.error('Failed to save preset:', err);
  } finally {
    saving.value = false;
  }
}

// Delete preset
async function deletePreset() {
  if (!selectedPreset.value) return;
  if (!confirm(`Delete "${selectedPreset.value.name}"? This cannot be undone.`)) return;

  try {
    await aiPresetsApi.delete(selectedPreset.value.id);
    selectedPreset.value = null;
    setNodes([]);
    setEdges([]);
    await fetchPresets();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete preset';
    console.error('Failed to delete preset:', err);
  }
}

// Duplicate preset
async function duplicatePreset() {
  if (!selectedPreset.value) return;

  try {
    const response = await aiPresetsApi.duplicate(selectedPreset.value.id);
    selectedPreset.value = response.data;
    await fetchPresets();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to duplicate preset';
    console.error('Failed to duplicate preset:', err);
  }
}

// Initial fetch
onMounted(async () => {
  await fetchPresets();
  // Auto-select preset if initialPresetId was provided
  if (props.initialPresetId) {
    const preset = presets.value.find((p) => p.id === props.initialPresetId);
    if (preset) {
      selectPreset(preset);
      emit('preset-loaded');
    }
  }
});

// Watch for changes to initialPresetId (if navigated to after mount)
watch(() => props.initialPresetId, async (newId) => {
  if (newId) {
    // Ensure presets are loaded
    if (presets.value.length === 0) {
      await fetchPresets();
    }
    const preset = presets.value.find((p) => p.id === newId);
    if (preset) {
      selectPreset(preset);
      emit('preset-loaded');
    }
  }
});
</script>

<template>
  <div class="ai-editor">
    <!-- Header -->
    <div class="editor-header">
      <div class="header-left">
        <h2>AI Behavior Editor</h2>
        <span v-if="selectedPreset" class="preset-name-display">
          {{ selectedPreset.name }}
          <span
            v-if="selectedPreset.isTemplate"
            class="template-badge"
            title="System template (read-only)"
          >
            Template
          </span>
        </span>
        <!-- Validation status -->
        <span
          v-if="(selectedPreset || isCreating) && nodes.length > 0"
          class="validation-badge"
          :class="{ valid: isTreeValid, invalid: !isTreeValid }"
          :title="isTreeValid ? 'Tree is valid' : `${validationIssues.length} issue(s)`"
        >
          {{ isTreeValid ? 'Valid' : `${validationIssues.filter(i => i.severity === 'error').length} errors` }}
        </span>
      </div>
      <div class="header-center">
        <!-- Undo/Redo buttons -->
        <div v-if="selectedPreset || isCreating" class="undo-redo-buttons">
          <button
            class="btn-icon"
            :disabled="!canUndo"
            title="Undo (Ctrl+Z)"
            @click="performUndo"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 10h10a5 5 0 015 5v2" />
              <path d="M3 10l5-5M3 10l5 5" />
            </svg>
          </button>
          <button
            class="btn-icon"
            :disabled="!canRedo"
            title="Redo (Ctrl+Shift+Z)"
            @click="performRedo"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10H11a5 5 0 00-5 5v2" />
              <path d="M21 10l-5-5M21 10l-5 5" />
            </svg>
          </button>
        </div>
        <!-- Auto-arrange button -->
        <button
          v-if="(selectedPreset || isCreating) && nodes.length > 0"
          class="btn-icon-text"
          title="Auto-arrange nodes (Ctrl+Shift+A)"
          @click="autoLayoutTree"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="8.5" y="14" width="7" height="7" rx="1" />
            <line x1="6.5" y1="10" x2="6.5" y2="12" />
            <line x1="17.5" y1="10" x2="17.5" y2="12" />
            <line x1="6.5" y1="12" x2="17.5" y2="12" />
            <line x1="12" y1="12" x2="12" y2="14" />
          </svg>
          <span>Auto-Arrange</span>
        </button>
        <!-- Execution order toggle -->
        <button
          v-if="(selectedPreset || isCreating) && nodes.length > 0"
          class="btn-icon-text"
          :class="{ active: showExecutionOrder }"
          title="Toggle execution order numbers"
          @click="showExecutionOrder = !showExecutionOrder"
        >
          <span class="order-toggle-icon">123</span>
          <span>Order</span>
        </button>
      </div>
      <div class="header-actions">
        <button
          v-if="selectedPreset && !selectedPreset.isTemplate"
          class="btn btn-secondary"
          :disabled="saving"
          @click="savePreset"
        >
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
        <button class="btn btn-primary" @click="startCreate">
          + New Preset
        </button>
      </div>
    </div>

    <!-- Error banner -->
    <div v-if="error" class="error-banner">
      {{ error }}
      <button @click="error = null">&times;</button>
    </div>

    <!-- Success banner -->
    <div v-if="successMessage" class="success-banner">
      {{ successMessage }}
    </div>

    <!-- Main content -->
    <div class="editor-body">
      <!-- Left panel: Preset list -->
      <div class="list-panel">
        <div class="filters">
          <div class="filter-row">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search presets..."
              class="search-input"
            />
            <button class="btn-reset" @click="resetFilters">Reset</button>
          </div>
          <select v-model="filterCategory" class="filter-select">
            <option value="">All Categories</option>
            <option v-for="cat in categories" :key="cat" :value="cat">
              {{ categoryNames[cat] }}
            </option>
          </select>
          <label class="checkbox-filter">
            <input v-model="includeTemplates" type="checkbox" />
            <span>Include Templates</span>
          </label>
        </div>

        <div class="list-content">
          <div v-if="loading" class="loading">Loading presets...</div>
          <div v-else-if="presets.length === 0" class="empty-list">
            No AI presets found. Create one to get started.
          </div>
          <div
            v-for="preset in presets"
            v-else
            :key="preset.id"
            class="preset-row"
            :class="{ selected: selectedPreset?.id === preset.id }"
            @click="selectPreset(preset)"
          >
            <div class="preset-header">
              <span class="preset-name">{{ preset.name }}</span>
              <span v-if="preset.isTemplate" class="template-icon" title="System template">
                T
              </span>
              <span
                v-if="preset.linkedCount && preset.linkedCount > 0"
                class="linked-badge"
                :title="`Linked to ${preset.linkedCount} definitions`"
              >
                {{ preset.linkedCount }}
              </span>
            </div>
            <div class="preset-meta">
              <span
                class="category-badge"
                :style="{ backgroundColor: categoryColors[preset.category as AIPresetCategory] }"
              >
                {{ categoryNames[preset.category as AIPresetCategory] }}
              </span>
            </div>
          </div>
        </div>

        <div class="list-footer">
          <span>{{ total }} presets</span>
        </div>
      </div>

      <!-- Center panel: Vue Flow canvas -->
      <div class="canvas-panel">
        <div v-if="!selectedPreset && !isCreating" class="canvas-placeholder">
          <p>Select a preset or create a new one to start editing</p>
        </div>
        <VueFlow
          v-else
          class="vue-flow-canvas"
          :node-types="nodeTypes"
          :default-viewport="{ x: 0, y: 0, zoom: 1 }"
          :min-zoom="0.2"
          :max-zoom="4"
          :is-valid-connection="isValidConnection"
          :default-edge-options="{ type: 'smoothstep', animated: true, style: { stroke: '#4b5563' } }"
          @node-click="onNodeClick"
          @pane-click="onPaneClick"
          @node-mouse-enter="(e: any) => hoveredNodeId = e.node.id"
          @node-mouse-leave="() => hoveredNodeId = null"
          @drop="onDrop"
          @dragover="onDragOver"
        >
          <Background pattern-color="#2a3040" :gap="20" />
          <MiniMap
            :node-color="(n: any) => getNodeColor(n.data?.type || 'default')"
            :mask-color="'rgba(10, 13, 18, 0.8)'"
          />
          <Controls />
        </VueFlow>

        <!-- Node palette (floating) -->
        <div v-if="selectedPreset || isCreating" class="node-palette">
          <div class="palette-header">Drag to Add</div>
          <div class="palette-section">
            <div class="palette-section-title">Composites</div>
            <div class="palette-nodes">
              <div
                class="palette-node"
                style="background: linear-gradient(135deg, #f59e0b, #d97706)"
                title="Selector - tries children until one succeeds"
                draggable="true"
                @dragstart="(e) => onDragStart(e, 'selector')"
                @dragend="onDragEnd"
              >
                ?
              </div>
              <div
                class="palette-node"
                style="background: linear-gradient(135deg, #3b82f6, #2563eb)"
                title="Sequence - runs children in order"
                draggable="true"
                @dragstart="(e) => onDragStart(e, 'sequence')"
                @dragend="onDragEnd"
              >
                ->
              </div>
              <div
                class="palette-node"
                style="background: linear-gradient(135deg, #a855f7, #9333ea)"
                title="Parallel - runs all children"
                draggable="true"
                @dragstart="(e) => onDragStart(e, 'parallel')"
                @dragend="onDragEnd"
              >
                ||
              </div>
            </div>
          </div>
          <div class="palette-section">
            <div class="palette-section-title">Decorators</div>
            <div class="palette-nodes">
              <div
                class="palette-node"
                style="background: linear-gradient(135deg, #eab308, #ca8a04)"
                title="Inverter - flips result"
                draggable="true"
                @dragstart="(e) => onDragStart(e, 'inverter')"
                @dragend="onDragEnd"
              >
                !
              </div>
              <div
                class="palette-node"
                style="background: linear-gradient(135deg, #eab308, #ca8a04)"
                title="Repeater - loops N times"
                draggable="true"
                @dragstart="(e) => onDragStart(e, 'repeater')"
                @dragend="onDragEnd"
              >
                @
              </div>
              <div
                class="palette-node"
                style="background: linear-gradient(135deg, #eab308, #ca8a04)"
                title="Succeeder - always succeed"
                draggable="true"
                @dragstart="(e) => onDragStart(e, 'succeeder')"
                @dragend="onDragEnd"
              >
                S
              </div>
            </div>
          </div>
          <div class="palette-section">
            <div class="palette-section-title">Leaves</div>
            <div class="palette-nodes">
              <div
                class="palette-node"
                style="background: linear-gradient(135deg, #06b6d4, #0891b2)"
                title="Condition - evaluates true/false"
                draggable="true"
                @dragstart="(e) => onDragStart(e, 'condition')"
                @dragend="onDragEnd"
              >
                ?
              </div>
              <div
                class="palette-node"
                style="background: linear-gradient(135deg, #22c55e, #16a34a)"
                title="Action - performs behavior"
                draggable="true"
                @dragstart="(e) => onDragStart(e, 'action')"
                @dragend="onDragEnd"
              >
                A
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right panel: Properties -->
      <div class="properties-panel">
        <!-- No selection -->
        <div v-if="!selectedPreset && !isCreating" class="no-selection">
          <p>Select a preset to view properties</p>
        </div>

        <!-- Preset metadata form (creating or editing preset info) -->
        <div v-else-if="isCreating || isEditing" class="properties-form">
          <div class="form-header">
            <h3>{{ isCreating ? 'New Preset' : 'Edit Preset' }}</h3>
          </div>

          <div class="form-body">
            <div class="form-group">
              <label>Name *</label>
              <input v-model="form.name" type="text" class="form-input" placeholder="Preset name" />
            </div>

            <div class="form-group">
              <label>Description</label>
              <textarea
                v-model="form.description"
                class="form-input"
                rows="3"
                placeholder="Optional description"
              />
            </div>

            <div class="form-group">
              <label>Category *</label>
              <select v-model="form.category" class="form-input">
                <option v-for="cat in categories" :key="cat" :value="cat">
                  {{ categoryNames[cat] }}
                </option>
              </select>
            </div>

            <!-- Validation Issues -->
            <div v-if="validationIssues.length > 0" class="validation-section">
              <label class="property-label">Validation Issues</label>
              <div class="validation-list">
                <div
                  v-for="(issue, idx) in validationIssues"
                  :key="idx"
                  class="validation-item"
                  :class="issue.severity"
                >
                  {{ issue.message }}
                </div>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button class="btn btn-secondary" @click="cancelEdit">Cancel</button>
            <button class="btn btn-primary" :disabled="!form.name || saving" @click="savePreset">
              {{ saving ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </div>

        <!-- Node properties panel (when node is selected) -->
        <div v-else-if="selectedNode" class="node-panel-wrapper">
          <NodePropertiesPanel
            :node="selectedNode"
            @update:node="handleNodeUpdate"
            @delete:node="handleNodeDelete"
          >
            <template #before-actions>
              <!-- Logic Flow Panel -->
              <LogicDescriptionPanel
                v-if="nodes.length > 0"
                :nodes="nodes"
                :edges="edges"
              />
            </template>
          </NodePropertiesPanel>

          <!-- Preset actions at bottom -->
          <div v-if="selectedPreset && !selectedPreset.isTemplate" class="properties-actions">
            <button class="btn btn-secondary" @click="startEdit">Edit Preset Info</button>
          </div>
        </div>

        <!-- Preset view (no node selected) -->
        <div v-else-if="selectedPreset" class="properties-view">
          <!-- Preset info header -->
          <div class="properties-header">
            <h3>{{ selectedPreset.name }}</h3>
            <span
              class="category-badge"
              :style="{ backgroundColor: categoryColors[selectedPreset.category as AIPresetCategory] }"
            >
              {{ categoryNames[selectedPreset.category as AIPresetCategory] }}
            </span>
          </div>

          <div class="properties-body">
            <!-- Description -->
            <div v-if="selectedPreset.description" class="property-row">
              <label>Description</label>
              <p class="property-value">{{ selectedPreset.description }}</p>
            </div>

            <!-- Linked count -->
            <div class="property-row">
              <label>Linked Definitions ({{ selectedPreset.linkedCount || 0 }})</label>
              <div v-if="selectedPreset.linkedCount && selectedPreset.linkedCount > 0" class="linked-definitions">
                <div v-if="selectedPreset.unitDefinitions?.length" class="linked-group">
                  <span class="linked-group-label">Units:</span>
                  <div class="linked-items">
                    <span
                      v-for="unit in selectedPreset.unitDefinitions"
                      :key="unit.id"
                      class="linked-item"
                    >
                      {{ unit.name }}
                    </span>
                  </div>
                </div>
                <div v-if="selectedPreset.buildingDefinitions?.length" class="linked-group">
                  <span class="linked-group-label">Buildings:</span>
                  <div class="linked-items">
                    <span
                      v-for="building in selectedPreset.buildingDefinitions"
                      :key="building.id"
                      class="linked-item"
                    >
                      {{ building.name }}
                    </span>
                  </div>
                </div>
              </div>
              <p v-else class="property-value no-links">No linked units or buildings</p>
            </div>

            <!-- Tree Stats -->
            <div class="property-row">
              <label>Tree Stats</label>
              <p class="property-value">{{ nodes.length }} nodes, {{ edges.length }} connections</p>
            </div>

            <!-- Validation Issues -->
            <div v-if="validationIssues.length > 0" class="validation-section">
              <hr class="divider" />
              <label class="property-label">Validation Issues</label>
              <div class="validation-list">
                <div
                  v-for="(issue, idx) in validationIssues"
                  :key="idx"
                  class="validation-item"
                  :class="issue.severity"
                >
                  {{ issue.message }}
                </div>
              </div>
            </div>

            <hr class="divider" />

            <div class="no-node-selected">
              <p>Click a node to edit its properties</p>
            </div>
          </div>

          <!-- Actions -->
          <div v-if="!selectedPreset.isTemplate" class="properties-actions">
            <button class="btn btn-primary" @click="startEdit">Edit Preset</button>
            <button class="btn btn-secondary" @click="duplicatePreset">Duplicate</button>
            <button
              class="btn btn-danger"
              :disabled="(selectedPreset.linkedCount || 0) > 0"
              :title="(selectedPreset.linkedCount || 0) > 0 ? 'Cannot delete - preset is linked to units/buildings' : 'Delete this preset'"
              @click="deletePreset"
            >
              Delete
            </button>
          </div>
          <div v-else class="properties-actions">
            <button class="btn btn-secondary" @click="duplicatePreset">
              Duplicate Template
            </button>
            <p class="template-note">Templates cannot be modified</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f1419;
  color: #e5e5e5;
}

/* Header */
.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a3040;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.editor-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.preset-name-display {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #9ca3af;
}

.template-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(234, 179, 8, 0.2);
  color: #eab308;
  border-radius: 4px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 12px;
}

/* Error banner */
.error-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border-bottom: 1px solid rgba(239, 68, 68, 0.3);
}

.error-banner button {
  background: none;
  border: none;
  color: #f87171;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
}

.success-banner {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12px 20px;
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border-bottom: 1px solid rgba(34, 197, 94, 0.3);
  font-weight: 500;
}

/* Main body - three panel layout */
.editor-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Left panel */
.list-panel {
  width: 280px;
  display: flex;
  flex-direction: column;
  background: #151a24;
  border-right: 1px solid #2a3040;
}

.filters {
  padding: 12px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a3040;
}

.filter-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  background: #0a0d12;
  border: 1px solid #2a3040;
  border-radius: 6px;
  color: #e5e5e5;
  font-size: 13px;
}

.search-input::placeholder {
  color: #4b5563;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.btn-reset {
  padding: 8px 12px;
  background: #2a3040;
  border: none;
  border-radius: 6px;
  color: #9ca3af;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-reset:hover {
  background: #374151;
  color: #e5e5e5;
}

.filter-select {
  width: 100%;
  padding: 8px 12px;
  background: #0a0d12;
  border: 1px solid #2a3040;
  border-radius: 6px;
  color: #e5e5e5;
  font-size: 13px;
  margin-bottom: 8px;
}

.checkbox-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #9ca3af;
  cursor: pointer;
}

.checkbox-filter input {
  width: 16px;
  height: 16px;
  accent-color: #3b82f6;
}

.list-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.loading,
.empty-list {
  padding: 20px;
  text-align: center;
  color: #6b7280;
  font-size: 13px;
}

.preset-row {
  padding: 12px;
  margin-bottom: 4px;
  background: #1a1f2e;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.preset-row:hover {
  background: #232938;
}

.preset-row.selected {
  background: #2a3550;
  border: 1px solid #3b82f6;
}

.preset-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.preset-name {
  font-weight: 500;
  font-size: 14px;
}

.template-icon {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(234, 179, 8, 0.2);
  color: #eab308;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
}

.linked-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
  border-radius: 4px;
  font-weight: 600;
}

.preset-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.category-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  color: #000;
  font-weight: 600;
}

.list-footer {
  padding: 12px;
  background: #1a1f2e;
  border-top: 1px solid #2a3040;
  font-size: 12px;
  color: #6b7280;
}

/* Center panel - Canvas */
.canvas-panel {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  background: #0a0d12;
}

.canvas-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
}

.vue-flow-canvas {
  flex: 1;
}

/* Node palette */
.node-palette {
  position: absolute;
  top: 12px;
  left: 12px;
  width: 140px;
  background: #1a1f2e;
  border: 1px solid #2a3040;
  border-radius: 8px;
  padding: 12px;
  z-index: 10;
}

.palette-header {
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
  margin-bottom: 12px;
  text-transform: uppercase;
}

.palette-section {
  margin-bottom: 12px;
}

.palette-section:last-child {
  margin-bottom: 0;
}

.palette-section-title {
  font-size: 10px;
  color: #6b7280;
  margin-bottom: 6px;
  text-transform: uppercase;
}

.palette-nodes {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.palette-node {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: grab;
  transition: transform 0.15s;
}

.palette-node:hover {
  transform: scale(1.1);
}

/* Right panel - Properties */
.properties-panel {
  width: 320px;
  display: flex;
  flex-direction: column;
  background: #151a24;
  border-left: 1px solid #2a3040;
}

.no-selection {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  color: #6b7280;
  text-align: center;
}

/* Properties form */
.properties-form {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.form-header {
  padding: 16px 20px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a3040;
}

.form-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.form-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 6px;
  text-transform: uppercase;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  background: #0a0d12;
  border: 1px solid #2a3040;
  border-radius: 6px;
  color: #e5e5e5;
  font-size: 14px;
}

.form-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.form-input::placeholder {
  color: #4b5563;
}

textarea.form-input {
  resize: vertical;
  min-height: 80px;
}

.form-actions {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  background: #1a1f2e;
  border-top: 1px solid #2a3040;
}

/* Properties view */
.properties-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.properties-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a3040;
}

.properties-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.properties-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.property-row {
  margin-bottom: 16px;
}

.property-row label {
  display: block;
  font-size: 11px;
  color: #6b7280;
  margin-bottom: 4px;
  text-transform: uppercase;
}

.property-value {
  margin: 0;
  font-size: 14px;
  color: #e5e5e5;
}

.divider {
  border: none;
  border-top: 1px solid #2a3040;
  margin: 20px 0;
}

.node-properties h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #9ca3af;
}

.node-type {
  text-transform: capitalize;
}

.no-node-selected {
  padding: 20px;
  text-align: center;
  color: #6b7280;
  font-size: 13px;
  background: #1a1f2e;
  border-radius: 8px;
}

.properties-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 20px;
  background: #1a1f2e;
  border-top: 1px solid #2a3040;
}

.template-note {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
  text-align: center;
}

/* Buttons */
.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-secondary {
  background: #374151;
  color: #e5e5e5;
}

.btn-secondary:hover:not(:disabled) {
  background: #4b5563;
}

.btn-danger {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.btn-danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.25);
}

/* Vue Flow dark theme overrides */
.vue-flow-canvas :deep(.vue-flow__pane) {
  cursor: default;
}

.vue-flow-canvas :deep(.vue-flow__edge-path) {
  stroke: #4b5563;
  stroke-width: 2;
}

.vue-flow-canvas :deep(.vue-flow__edge.selected .vue-flow__edge-path),
.vue-flow-canvas :deep(.vue-flow__edge:hover .vue-flow__edge-path) {
  stroke: #60a5fa;
  stroke-width: 3;
}

.vue-flow-canvas :deep(.vue-flow__connection-line) {
  stroke: #60a5fa;
  stroke-width: 2;
}

.vue-flow-canvas :deep(.vue-flow__controls) {
  background: #1a1f2e;
  border: 1px solid #2a3040;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.vue-flow-canvas :deep(.vue-flow__controls-button) {
  background: transparent;
  border: none;
  color: #9ca3af;
  width: 28px;
  height: 28px;
}

.vue-flow-canvas :deep(.vue-flow__controls-button:hover) {
  background: #2a3040;
  color: #e5e5e5;
}

.vue-flow-canvas :deep(.vue-flow__controls-button svg) {
  fill: currentColor;
}

.vue-flow-canvas :deep(.vue-flow__minimap) {
  background: #1a1f2e;
  border: 1px solid #2a3040;
  border-radius: 8px;
}

.vue-flow-canvas :deep(.vue-flow__minimap-mask) {
  fill: rgba(10, 13, 18, 0.8);
}

.vue-flow-canvas :deep(.vue-flow__attribution) {
  display: none;
}

/* Dragging state */
.palette-node[draggable='true'] {
  user-select: none;
}

.palette-node:active {
  cursor: grabbing;
}

.canvas-panel.dragging {
  background: rgba(59, 130, 246, 0.05);
}

/* Validation badge */
.validation-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.validation-badge.valid {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.validation-badge.invalid {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

/* Header center section */
.header-center {
  display: flex;
  align-items: center;
  gap: 16px;
}

.undo-redo-buttons {
  display: flex;
  gap: 4px;
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: #2a3040;
  border: 1px solid #374151;
  border-radius: 6px;
  color: #9ca3af;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-icon:hover:not(:disabled) {
  background: #374151;
  color: #e5e5e5;
}

.btn-icon:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-icon-text {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #2a3040;
  border: 1px solid #374151;
  border-radius: 6px;
  color: #9ca3af;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-icon-text:hover {
  background: #374151;
  color: #e5e5e5;
}

.btn-icon-text.active {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
  color: #60a5fa;
}

.order-toggle-icon {
  font-weight: 700;
  font-size: 11px;
  letter-spacing: -0.5px;
}

/* Validation section */
.validation-section {
  margin-top: 16px;
}

.property-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

.validation-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.validation-item {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
}

.validation-item.error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.validation-item.warning {
  background: rgba(234, 179, 8, 0.1);
  border: 1px solid rgba(234, 179, 8, 0.2);
  color: #eab308;
}

/* Node panel wrapper */
.node-panel-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.node-panel-wrapper .properties-actions {
  margin-top: auto;
}

/* Linked definitions display */
.linked-definitions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.linked-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.linked-group-label {
  font-size: 11px;
  color: #6b7280;
  font-weight: 500;
}

.linked-items {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.linked-item {
  font-size: 12px;
  padding: 4px 8px;
  background: #1a1f2e;
  border: 1px solid #2a3040;
  border-radius: 4px;
  color: #e5e5e5;
}

.no-links {
  color: #6b7280;
  font-style: italic;
}
</style>
