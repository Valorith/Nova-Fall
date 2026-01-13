/**
 * Calculates execution order for behavior tree nodes
 * Uses depth-first traversal to determine evaluation order
 */

import type { Node, Edge } from '@vue-flow/core';

/**
 * Calculate the execution order for all nodes in a behavior tree
 * Returns a Map of nodeId -> order number (1-based)
 */
export function calculateExecutionOrder(nodes: Node[], edges: Edge[]): Map<string, number> {
  const orderMap = new Map<string, number>();

  if (nodes.length === 0) return orderMap;

  // Find root node (node with no incoming edges)
  const nodesWithIncoming = new Set(edges.map((e) => e.target));
  const root = nodes.find((n) => !nodesWithIncoming.has(n.id));

  if (!root) return orderMap;

  let order = 1;

  // Build adjacency list for efficient child lookup
  const childrenMap = new Map<string, Node[]>();
  for (const node of nodes) {
    childrenMap.set(node.id, []);
  }

  for (const edge of edges) {
    const children = childrenMap.get(edge.source);
    const childNode = nodes.find((n) => n.id === edge.target);
    if (children && childNode) {
      children.push(childNode);
    }
  }

  // Sort children by x position (left to right) for consistent ordering
  for (const [, children] of childrenMap) {
    children.sort((a, b) => a.position.x - b.position.x);
  }

  // Depth-first traversal
  function traverse(nodeId: string) {
    orderMap.set(nodeId, order++);

    const children = childrenMap.get(nodeId) || [];
    for (const child of children) {
      traverse(child.id);
    }
  }

  traverse(root.id);
  return orderMap;
}

/**
 * Get the path from root to a specific node
 * Returns array of node IDs from root to target (inclusive)
 */
export function getPathToNode(nodeId: string, edges: Edge[]): string[] {
  const path: string[] = [];
  let current = nodeId;

  // Walk backwards from target to root
  while (current) {
    path.unshift(current);
    const parentEdge = edges.find((e) => e.target === current);
    if (parentEdge) {
      current = parentEdge.source;
    } else {
      break; // Reached root
    }
  }

  return path;
}

/**
 * Get all descendants of a node (for collapse functionality)
 * Returns Set of node IDs that are children/grandchildren/etc.
 */
export function getDescendants(nodeId: string, edges: Edge[]): Set<string> {
  const descendants = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const childEdges = edges.filter((e) => e.source === current);

    for (const edge of childEdges) {
      if (!descendants.has(edge.target)) {
        descendants.add(edge.target);
        queue.push(edge.target);
      }
    }
  }

  return descendants;
}

/**
 * Count nodes in a subtree (including the root)
 */
export function countSubtreeNodes(nodeId: string, edges: Edge[]): number {
  const descendants = getDescendants(nodeId, edges);
  return descendants.size + 1; // +1 for the node itself
}
