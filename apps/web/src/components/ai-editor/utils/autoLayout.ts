import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@vue-flow/core';

export interface LayoutOptions {
  /** Layout direction: 'TB' = top-to-bottom, 'LR' = left-to-right */
  direction: 'TB' | 'LR';
  /** Width of each node in pixels */
  nodeWidth: number;
  /** Height of each node in pixels */
  nodeHeight: number;
  /** Horizontal spacing between nodes */
  horizontalSpacing: number;
  /** Vertical spacing between levels */
  verticalSpacing: number;
}

const DEFAULT_OPTIONS: LayoutOptions = {
  direction: 'TB',
  nodeWidth: 140,
  nodeHeight: 50,
  horizontalSpacing: 40,
  verticalSpacing: 60,
};

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

  // Add nodes to the graph
  for (const node of plainNodes) {
    g.setNode(node.id, {
      width: opts.nodeWidth,
      height: opts.nodeHeight,
    });
  }

  // Add edges to the graph
  for (const edge of plainEdges) {
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

    // Dagre returns center position, convert to top-left for Vue Flow
    const newNode: Node = {
      id: node.id,
      type: node.type,
      data: node.data,
      position: {
        x: Math.round(nodeWithPosition.x - opts.nodeWidth / 2),
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
