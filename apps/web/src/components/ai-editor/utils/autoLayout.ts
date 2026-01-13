import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@vue-flow/core';

export interface LayoutOptions {
  /** Layout direction: 'TB' = top-to-bottom, 'LR' = left-to-right */
  direction: 'TB' | 'LR';
  /** Minimum width of each node in pixels */
  minNodeWidth: number;
  /** Height of each node in pixels */
  nodeHeight: number;
  /** Horizontal spacing between nodes */
  horizontalSpacing: number;
  /** Vertical spacing between levels */
  verticalSpacing: number;
  /** Whether to chain Sequence children vertically */
  chainSequences: boolean;
  /** Pixels per character for width estimation */
  charWidth: number;
  /** Extra padding added to calculated node width */
  nodePadding: number;
}

const DEFAULT_OPTIONS: LayoutOptions = {
  direction: 'TB',
  minNodeWidth: 120,
  nodeHeight: 50,
  horizontalSpacing: 50,
  verticalSpacing: 60,
  chainSequences: true,
  charWidth: 8,
  nodePadding: 50,
};

/**
 * Calculate the width of a node based on its label and type.
 * This ensures dagre allocates enough space for wide nodes.
 */
function calculateNodeWidth(
  node: { id: string; data: Record<string, unknown> },
  opts: LayoutOptions
): number {
  // Get the label from node data
  const label = (node.data.label as string) || node.id;

  // Calculate width based on label length
  const labelWidth = label.length * opts.charWidth + opts.nodePadding;

  // Also consider subtitle/params that might be displayed
  const params = node.data.params as Record<string, unknown> | undefined;
  let paramsWidth = 0;
  if (params) {
    // Check for common param values that get displayed
    const displayValues = Object.values(params)
      .filter((v) => typeof v === 'string' || typeof v === 'number')
      .map((v) => String(v));
    if (displayValues.length > 0) {
      const longestValue = displayValues.reduce((a, b) => (a.length > b.length ? a : b), '');
      paramsWidth = longestValue.length * opts.charWidth;
    }
  }

  // Use the wider of label or params, with minimum constraint
  return Math.max(opts.minNodeWidth, labelWidth, paramsWidth + opts.nodePadding);
}

/**
 * Transform edges to create vertical chains for Sequence node children.
 * This makes the layout show sequential execution flow visually.
 */
function transformEdgesForLayout(
  nodes: { id: string; data: Record<string, unknown> }[],
  edges: { id: string; source: string; target: string }[]
): { id: string; source: string; target: string }[] {
  // Build a map of node IDs to their data
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Find all Sequence nodes
  const sequenceNodeIds = new Set(
    nodes.filter((n) => n.data.type === 'sequence').map((n) => n.id)
  );

  // Group children by their parent Sequence
  const sequenceChildren = new Map<string, string[]>();
  for (const edge of edges) {
    if (sequenceNodeIds.has(edge.source)) {
      const children = sequenceChildren.get(edge.source) || [];
      children.push(edge.target);
      sequenceChildren.set(edge.source, children);
    }
  }

  // Sort children by their x position (left to right = execution order)
  for (const [, children] of sequenceChildren) {
    children.sort((a, b) => {
      const nodeA = nodeMap.get(a);
      const nodeB = nodeMap.get(b);
      // Use position from data if available, otherwise maintain order
      const posA = (nodeA?.data.position as { x: number } | undefined)?.x ?? 0;
      const posB = (nodeB?.data.position as { x: number } | undefined)?.x ?? 0;
      return posA - posB;
    });
  }

  // Transform edges: for Sequence nodes, chain children instead of siblings
  const transformedEdges: { id: string; source: string; target: string }[] = [];
  const processedSequenceChildren = new Set<string>();

  for (const edge of edges) {
    if (sequenceNodeIds.has(edge.source)) {
      const children = sequenceChildren.get(edge.source);
      if (children && children.length > 0) {
        // Only process once per sequence
        if (!processedSequenceChildren.has(edge.source)) {
          processedSequenceChildren.add(edge.source);

          const firstChild = children[0];
          if (firstChild) {
            // Add edge from Sequence to first child
            transformedEdges.push({
              id: `${edge.source}-${firstChild}-layout`,
              source: edge.source,
              target: firstChild,
            });

            // Chain remaining children
            for (let i = 0; i < children.length - 1; i++) {
              const currentChild = children[i];
              const nextChild = children[i + 1];
              if (currentChild && nextChild) {
                transformedEdges.push({
                  id: `${currentChild}-${nextChild}-chain`,
                  source: currentChild,
                  target: nextChild,
                });
              }
            }
          }
        }
        // Skip the original edge (we've replaced it with chain)
      } else {
        // No children, keep original edge
        transformedEdges.push(edge);
      }
    } else {
      // Not a Sequence node, keep original edge
      transformedEdges.push(edge);
    }
  }

  return transformedEdges;
}

/**
 * Auto-arrange nodes using the Dagre graph layout algorithm.
 * Produces a clean hierarchical layout optimized for behavior trees.
 *
 * @param nodes - Vue Flow nodes to arrange
 * @param edges - Vue Flow edges (connections between nodes)
 * @param options - Layout configuration options
 * @returns New array of nodes with updated positions
 */
export function autoArrangeNodes(
  nodes: Node[],
  edges: Edge[],
  options?: Partial<LayoutOptions>
): Node[] {
  if (nodes.length === 0) return nodes;

  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Convert Vue reactive proxies to plain objects for dagre compatibility
  // This ensures dagre works correctly with the node IDs
  const plainNodes = nodes.map((n) => ({
    id: String(n.id),
    type: n.type ?? 'default',
    position: { x: Number(n.position.x), y: Number(n.position.y) },
    data: JSON.parse(JSON.stringify(n.data)),
    draggable: n.draggable,
    selectable: n.selectable,
    connectable: n.connectable,
    deletable: n.deletable,
  }));

  const plainEdges = edges.map((e) => ({
    id: String(e.id),
    source: String(e.source),
    target: String(e.target),
  }));

  // Transform edges for layout if chainSequences is enabled
  const layoutEdges = opts.chainSequences
    ? transformEdgesForLayout(plainNodes, plainEdges)
    : plainEdges;

  // Create a new directed graph
  const g = new dagre.graphlib.Graph();

  // Set graph options
  g.setGraph({
    rankdir: opts.direction,
    nodesep: opts.horizontalSpacing,
    ranksep: opts.verticalSpacing,
    marginx: 20,
    marginy: 20,
  });

  // Default to assign new object as edge label
  g.setDefaultEdgeLabel(() => ({}));

  // Calculate width for each node and store for later use
  const nodeWidths = new Map<string, number>();
  for (const node of plainNodes) {
    const width = calculateNodeWidth(node, opts);
    nodeWidths.set(node.id, width);
  }

  // Add nodes to the graph with dynamic widths
  for (const node of plainNodes) {
    g.setNode(node.id, {
      width: nodeWidths.get(node.id) ?? opts.minNodeWidth,
      height: opts.nodeHeight,
    });
  }

  // Add edges to the graph (using transformed edges for layout)
  for (const edge of layoutEdges) {
    g.setEdge(edge.source, edge.target);
  }

  // Run the layout algorithm
  dagre.layout(g);

  // Extract new positions and return updated nodes
  // Create completely new node objects to ensure Vue Flow reactivity
  return plainNodes.map((node): Node => {
    const nodeWithPosition = g.node(node.id);
    if (!nodeWithPosition) {
      console.warn(`[autoLayout] Node ${node.id} not found in dagre graph`);
      return node as Node;
    }

    // Get the calculated width for this specific node
    const nodeWidth = nodeWidths.get(node.id) ?? opts.minNodeWidth;

    // Dagre returns center position, convert to top-left for Vue Flow
    const newNode: Node = {
      id: node.id,
      type: node.type,
      data: node.data,
      position: {
        x: Math.round(nodeWithPosition.x - nodeWidth / 2),
        y: Math.round(nodeWithPosition.y - opts.nodeHeight / 2),
      },
    };

    // Preserve any other Vue Flow node properties
    if (node.draggable !== undefined) newNode.draggable = node.draggable;
    if (node.selectable !== undefined) newNode.selectable = node.selectable;
    if (node.connectable !== undefined) newNode.connectable = node.connectable;
    if (node.deletable !== undefined) newNode.deletable = node.deletable;

    return newNode;
  });
}
