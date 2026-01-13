/**
 * Utilities for transforming Sequence node edges between:
 * - Standard format: Sequence → Child1, Sequence → Child2, Sequence → Child3
 * - Chained format: Sequence → Child1 → Child2 → Child3
 *
 * The chained format is more intuitive visually because it shows
 * that each step depends on the previous one succeeding.
 */

import type { BehaviorEdge, BehaviorNode } from '@nova-fall/shared';

interface SimpleEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/**
 * Transform standard Sequence edges to chained format.
 * Sequence → [A, B, C] becomes Sequence → A → B → C
 */
export function chainSequenceEdges(
  nodes: BehaviorNode[],
  edges: BehaviorEdge[]
): BehaviorEdge[] {
  // Build node lookup
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Find all Sequence nodes
  const sequenceNodeIds = new Set(
    nodes.filter((n) => n.type === 'sequence').map((n) => n.id)
  );

  if (sequenceNodeIds.size === 0) {
    return edges;
  }

  // Group children by their parent Sequence
  const sequenceChildren = new Map<string, string[]>();
  for (const edge of edges) {
    if (sequenceNodeIds.has(edge.source)) {
      const children = sequenceChildren.get(edge.source) || [];
      children.push(edge.target);
      sequenceChildren.set(edge.source, children);
    }
  }

  // Sort children by x position (left to right = execution order)
  for (const [, children] of sequenceChildren) {
    children.sort((a, b) => {
      const nodeA = nodeMap.get(a);
      const nodeB = nodeMap.get(b);
      const posA = nodeA?.position.x ?? 0;
      const posB = nodeB?.position.x ?? 0;
      return posA - posB;
    });
  }

  // Transform edges
  const chainedEdges: BehaviorEdge[] = [];
  const processedSequences = new Set<string>();

  for (const edge of edges) {
    if (sequenceNodeIds.has(edge.source)) {
      // This is a Sequence → Child edge
      if (!processedSequences.has(edge.source)) {
        processedSequences.add(edge.source);

        const children = sequenceChildren.get(edge.source) || [];
        const firstChild = children[0];
        if (children.length > 0 && firstChild) {
          // Add Sequence → first child
          chainedEdges.push({
            id: `${edge.source}-${firstChild}`,
            source: edge.source,
            target: firstChild,
          });

          // Chain remaining children
          for (let i = 0; i < children.length - 1; i++) {
            const current = children[i];
            const next = children[i + 1];
            if (current && next) {
              const chainEdge = {
                id: `${current}-${next}`,
                source: current,
                target: next,
              };
              chainedEdges.push(chainEdge);
            }
          }
        }
      }
      // Skip original Sequence→Child edges (replaced by chain)
    } else {
      // Not a Sequence edge, keep as-is
      chainedEdges.push(edge);
    }
  }

  return chainedEdges;
}

/**
 * Transform chained Sequence edges back to standard format.
 * Sequence → A → B → C becomes Sequence → [A, B, C]
 *
 * This is needed when saving the tree to ensure the behavior tree
 * execution logic works correctly.
 */
export function unchainSequenceEdges(
  nodes: BehaviorNode[],
  edges: BehaviorEdge[]
): BehaviorEdge[] {
  // Build node lookup
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Find all Sequence nodes
  const sequenceNodeIds = new Set(
    nodes.filter((n) => n.type === 'sequence').map((n) => n.id)
  );

  if (sequenceNodeIds.size === 0) {
    return edges;
  }

  // Build adjacency list: who points to whom
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const edge of edges) {
    const outs = outgoing.get(edge.source) || [];
    outs.push(edge.target);
    outgoing.set(edge.source, outs);

    const ins = incoming.get(edge.target) || [];
    ins.push(edge.source);
    incoming.set(edge.target, ins);
  }

  // For each Sequence, find all nodes in its chain
  const sequenceAllChildren = new Map<string, string[]>();

  for (const seqId of sequenceNodeIds) {
    const directChildren = outgoing.get(seqId) || [];
    const allChildren: string[] = [];

    // Follow each direct child's chain
    for (const firstChild of directChildren) {
      // Collect chain starting from firstChild
      const chain: string[] = [];
      let current: string | undefined = firstChild;

      while (current) {
        chain.push(current);

        // Find next in chain: a node that:
        // 1. Current points to
        // 2. Is not a Sequence (don't follow into nested composites)
        // 3. Has only one incoming edge (from current)
        const targets = outgoing.get(current) || [];
        let nextInChain: string | undefined;

        for (const target of targets) {
          const targetIncoming = incoming.get(target) || [];
          const targetNode = nodeMap.get(target);

          // Check if this is a continuation of the chain
          // (not a composite node, and only incoming from current)
          if (
            targetNode &&
            !['selector', 'sequence', 'parallel'].includes(targetNode.type) &&
            targetIncoming.length === 1 &&
            targetIncoming[0] === current
          ) {
            nextInChain = target;
            break;
          }
        }

        current = nextInChain;
      }

      allChildren.push(...chain);
    }

    sequenceAllChildren.set(seqId, allChildren);
  }

  // Build new edges: Sequence → each child directly
  const unchainedEdges: BehaviorEdge[] = [];
  const handledEdges = new Set<string>();

  // First, add all Sequence → child edges
  for (const [seqId, children] of sequenceAllChildren) {
    for (const childId of children) {
      const edgeId = `${seqId}-${childId}`;
      unchainedEdges.push({
        id: edgeId,
        source: seqId,
        target: childId,
      });

      // Mark edges in the chain as handled
      // The chain edges between children should be removed
    }
  }

  // Mark chain edges between Sequence children as handled
  for (const [seqId, children] of sequenceAllChildren) {
    for (let i = 0; i < children.length - 1; i++) {
      const current = children[i];
      const next = children[i + 1];
      if (current && next) {
        // This edge is part of the chain, don't include it
        handledEdges.add(`${current}-${next}`);
      }
    }
    // Also mark the Sequence's direct edge to first child
    if (children[0]) {
      handledEdges.add(`${seqId}-${children[0]}`);
    }
  }

  // Add remaining edges (non-Sequence edges)
  for (const edge of edges) {
    if (!handledEdges.has(edge.id) && !sequenceNodeIds.has(edge.source)) {
      // Check if this edge is already covered
      const isSequenceChild = Array.from(sequenceAllChildren.values()).some(
        (children) => children.includes(edge.target) && children.includes(edge.source)
      );

      if (!isSequenceChild) {
        unchainedEdges.push(edge);
      }
    }
  }

  return unchainedEdges;
}

/**
 * Simple version: Transform Vue Flow edges for display (chaining Sequences)
 */
export function chainEdgesForDisplay<T extends SimpleEdge>(
  nodes: { id: string; data: { type: string }; position: { x: number } }[],
  edges: T[]
): T[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const sequenceNodeIds = new Set(
    nodes.filter((n) => n.data.type === 'sequence').map((n) => n.id)
  );

  if (sequenceNodeIds.size === 0) {
    return edges;
  }

  // Group and sort children by Sequence
  const sequenceChildren = new Map<string, string[]>();
  for (const edge of edges) {
    if (sequenceNodeIds.has(edge.source)) {
      const children = sequenceChildren.get(edge.source) || [];
      children.push(edge.target);
      sequenceChildren.set(edge.source, children);
    }
  }

  // Sort children by y position (top to bottom = execution order for vertical layout)
  for (const [, children] of sequenceChildren) {
    children.sort((a, b) => {
      const nodeA = nodeMap.get(a);
      const nodeB = nodeMap.get(b);
      return (nodeA?.position.y ?? 0) - (nodeB?.position.y ?? 0);
    });
  }

  // Transform
  const result: T[] = [];
  const processedSequences = new Set<string>();

  for (const edge of edges) {
    if (sequenceNodeIds.has(edge.source)) {
      if (!processedSequences.has(edge.source)) {
        processedSequences.add(edge.source);

        const children = sequenceChildren.get(edge.source) || [];
        if (children.length > 0 && children[0]) {
          // Sequence → first child
          result.push({
            ...edge,
            id: `${edge.source}-${children[0]}`,
            target: children[0],
          } as T);

          // Chain children
          for (let i = 0; i < children.length - 1; i++) {
            const current = children[i];
            const next = children[i + 1];
            if (current && next) {
              // Create a clean chain edge without sourceHandle/targetHandle
              // since leaf nodes use default handles (no ID)
              const chainEdge = {
                ...edge,
                id: `${current}-${next}`,
                source: current,
                target: next,
                sourceHandle: null,
                targetHandle: null,
              } as T;
              result.push(chainEdge);
            }
          }
        }
      }
    } else {
      result.push(edge);
    }
  }

  return result;
}

/**
 * Transform chained Vue Flow edges back to standard format for saving
 */
export function unchainEdgesForSave<T extends SimpleEdge>(
  nodes: { id: string; data: { type: string } }[],
  edges: T[]
): T[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const sequenceNodeIds = new Set(
    nodes.filter((n) => n.data.type === 'sequence').map((n) => n.id)
  );

  if (sequenceNodeIds.size === 0) {
    return edges;
  }

  // Build adjacency
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const outs = outgoing.get(edge.source) || [];
    outs.push(edge.target);
    outgoing.set(edge.source, outs);
  }

  // Find all children of each Sequence by following chains
  const sequenceAllChildren = new Map<string, string[]>();

  for (const seqId of sequenceNodeIds) {
    const firstChildren = outgoing.get(seqId) || [];
    const allChildren: string[] = [];

    for (const firstChild of firstChildren) {
      let current: string | undefined = firstChild;
      while (current) {
        allChildren.push(current);

        // Find next: node that current points to, not a composite
        const targets = outgoing.get(current) || [];
        let next: string | undefined;

        for (const t of targets) {
          const node = nodeMap.get(t);
          if (node && !['selector', 'sequence', 'parallel'].includes(node.data.type)) {
            // Check this isn't pointing to a sibling sequence's child
            next = t;
            break;
          }
        }

        current = next;
      }
    }

    sequenceAllChildren.set(seqId, allChildren);
  }

  // Build standard edges
  const result: T[] = [];
  const edgeTemplate = edges[0]; // Use as template for edge properties

  if (!edgeTemplate) return edges;

  // Add Sequence → each child
  for (const [seqId, children] of sequenceAllChildren) {
    for (const childId of children) {
      result.push({
        ...edgeTemplate,
        id: `${seqId}-${childId}`,
        source: seqId,
        target: childId,
      } as T);
    }
  }

  // Add non-Sequence edges (but not chain edges)
  const chainEdges = new Set<string>();
  for (const [, children] of sequenceAllChildren) {
    for (let i = 0; i < children.length - 1; i++) {
      const current = children[i];
      const next = children[i + 1];
      if (current && next) {
        chainEdges.add(`${current}-${next}`);
      }
    }
  }

  for (const edge of edges) {
    if (!sequenceNodeIds.has(edge.source) && !chainEdges.has(edge.id)) {
      result.push(edge);
    }
  }

  return result;
}
