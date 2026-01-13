/**
 * Behavior Tree Executor
 * Evaluates behavior trees at runtime to determine unit/building actions
 */

import type {
  BehaviorTree,
  BehaviorNode,
  BehaviorEdge,
  AIContext,
  NodeResult,
} from '@nova-fall/shared';
import { evaluateCondition } from './conditions.js';
import { executeAction, type ActionResult } from './actions.js';

/**
 * Result of executing a behavior tree
 */
export interface ExecutionResult {
  result: NodeResult;
  action: ActionResult | null;
  executedPath: string[]; // IDs of nodes that were executed
}

/**
 * Behavior Tree Executor
 * Traverses a behavior tree and returns the resulting action
 */
export class BehaviorTreeExecutor {
  private tree: BehaviorTree;
  private nodeMap: Map<string, BehaviorNode>;
  private childrenMap: Map<string, string[]>; // parentId -> ordered child IDs

  constructor(tree: BehaviorTree) {
    this.tree = tree;
    this.nodeMap = new Map();
    this.childrenMap = new Map();
    this.buildMaps();
  }

  /**
   * Build lookup maps for efficient tree traversal
   */
  private buildMaps(): void {
    // Build node map
    for (const node of this.tree.nodes) {
      this.nodeMap.set(node.id, node);
    }

    // Build children map (edges sorted by order)
    const edgesBySource = new Map<string, BehaviorEdge[]>();
    for (const edge of this.tree.edges) {
      const existing = edgesBySource.get(edge.source) || [];
      existing.push(edge);
      edgesBySource.set(edge.source, existing);
    }

    // Sort children by order and store target IDs
    for (const [sourceId, edges] of edgesBySource) {
      const sortedEdges = edges.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      this.childrenMap.set(sourceId, sortedEdges.map((e) => e.target));
    }
  }

  /**
   * Execute the behavior tree and return the action to perform
   */
  tick(context: AIContext): ExecutionResult {
    const executedPath: string[] = [];

    if (!this.tree.rootId) {
      return { result: 'failure', action: null, executedPath };
    }

    const rootNode = this.nodeMap.get(this.tree.rootId);
    if (!rootNode) {
      return { result: 'failure', action: null, executedPath };
    }

    const { result, action } = this.executeNode(rootNode, context, executedPath);
    return { result, action, executedPath };
  }

  /**
   * Execute a single node and its children recursively
   */
  private executeNode(
    node: BehaviorNode,
    context: AIContext,
    executedPath: string[]
  ): { result: NodeResult; action: ActionResult | null } {
    executedPath.push(node.id);

    switch (node.type) {
      // Composite nodes
      case 'selector':
        return this.executeSelector(node, context, executedPath);
      case 'sequence':
        return this.executeSequence(node, context, executedPath);
      case 'parallel':
        return this.executeParallel(node, context, executedPath);

      // Decorator nodes
      case 'inverter':
        return this.executeInverter(node, context, executedPath);
      case 'succeeder':
        return this.executeSucceeder(node, context, executedPath);
      case 'repeater':
        return this.executeRepeater(node, context, executedPath);
      case 'until_fail':
        return this.executeUntilFail(node, context, executedPath);

      // Leaf nodes
      case 'condition':
        return this.executeCondition(node, context);
      case 'action':
        return this.executeAction(node, context);

      default:
        return { result: 'failure', action: null };
    }
  }

  /**
   * Get children of a node in order
   */
  private getChildren(nodeId: string): BehaviorNode[] {
    const childIds = this.childrenMap.get(nodeId) || [];
    return childIds
      .map((id) => this.nodeMap.get(id))
      .filter((n): n is BehaviorNode => n !== undefined);
  }

  // ==================== COMPOSITE NODES ====================

  /**
   * Selector: Try children in order until one succeeds
   */
  private executeSelector(
    node: BehaviorNode,
    context: AIContext,
    executedPath: string[]
  ): { result: NodeResult; action: ActionResult | null } {
    const children = this.getChildren(node.id);

    for (const child of children) {
      const { result, action } = this.executeNode(child, context, executedPath);

      if (result === 'success') {
        return { result: 'success', action };
      }
      if (result === 'running') {
        return { result: 'running', action };
      }
      // 'failure' -> try next child
    }

    return { result: 'failure', action: null };
  }

  /**
   * Sequence: Run children in order until one fails
   */
  private executeSequence(
    node: BehaviorNode,
    context: AIContext,
    executedPath: string[]
  ): { result: NodeResult; action: ActionResult | null } {
    const children = this.getChildren(node.id);
    let lastAction: ActionResult | null = null;

    for (const child of children) {
      const { result, action } = this.executeNode(child, context, executedPath);

      if (action) {
        lastAction = action;
      }

      if (result === 'failure') {
        return { result: 'failure', action: null };
      }
      if (result === 'running') {
        return { result: 'running', action: lastAction };
      }
      // 'success' -> continue to next child
    }

    return { result: 'success', action: lastAction };
  }

  /**
   * Parallel: Run all children simultaneously
   * Succeeds if all children succeed, fails if any child fails
   */
  private executeParallel(
    node: BehaviorNode,
    context: AIContext,
    executedPath: string[]
  ): { result: NodeResult; action: ActionResult | null } {
    const children = this.getChildren(node.id);
    let hasRunning = false;
    let lastAction: ActionResult | null = null;

    for (const child of children) {
      const { result, action } = this.executeNode(child, context, executedPath);

      if (action) {
        lastAction = action;
      }

      if (result === 'failure') {
        return { result: 'failure', action: null };
      }
      if (result === 'running') {
        hasRunning = true;
      }
    }

    return {
      result: hasRunning ? 'running' : 'success',
      action: lastAction,
    };
  }

  // ==================== DECORATOR NODES ====================

  /**
   * Inverter: Flip success/failure of child
   */
  private executeInverter(
    node: BehaviorNode,
    context: AIContext,
    executedPath: string[]
  ): { result: NodeResult; action: ActionResult | null } {
    const children = this.getChildren(node.id);
    const firstChild = children[0];
    if (!firstChild) {
      return { result: 'failure', action: null };
    }

    const { result, action } = this.executeNode(firstChild, context, executedPath);

    if (result === 'success') {
      return { result: 'failure', action };
    }
    if (result === 'failure') {
      return { result: 'success', action };
    }
    // 'running' stays running
    return { result: 'running', action };
  }

  /**
   * Succeeder: Always returns success
   */
  private executeSucceeder(
    node: BehaviorNode,
    context: AIContext,
    executedPath: string[]
  ): { result: NodeResult; action: ActionResult | null } {
    const children = this.getChildren(node.id);
    const firstChild = children[0];
    if (!firstChild) {
      return { result: 'success', action: null };
    }

    const { action } = this.executeNode(firstChild, context, executedPath);
    return { result: 'success', action };
  }

  /**
   * Repeater: Repeat child N times (for behavior trees, just run once in a tick)
   */
  private executeRepeater(
    node: BehaviorNode,
    context: AIContext,
    executedPath: string[]
  ): { result: NodeResult; action: ActionResult | null } {
    const children = this.getChildren(node.id);
    const firstChild = children[0];
    if (!firstChild) {
      return { result: 'success', action: null };
    }

    // In tick-based execution, we just run the child once per tick
    return this.executeNode(firstChild, context, executedPath);
  }

  /**
   * UntilFail: Keep running child until it fails (run once per tick)
   */
  private executeUntilFail(
    node: BehaviorNode,
    context: AIContext,
    executedPath: string[]
  ): { result: NodeResult; action: ActionResult | null } {
    const children = this.getChildren(node.id);
    const firstChild = children[0];
    if (!firstChild) {
      return { result: 'failure', action: null };
    }

    const { result, action } = this.executeNode(firstChild, context, executedPath);

    if (result === 'failure') {
      return { result: 'success', action: null };
    }
    // Keep running while child succeeds
    return { result: 'running', action };
  }

  // ==================== LEAF NODES ====================

  /**
   * Condition: Evaluate a condition
   */
  private executeCondition(
    node: BehaviorNode,
    context: AIContext
  ): { result: NodeResult; action: ActionResult | null } {
    const conditionId = node.params.conditionId as string;
    if (!conditionId) {
      return { result: 'failure', action: null };
    }

    const success = evaluateCondition(conditionId, node.params, context);
    return { result: success ? 'success' : 'failure', action: null };
  }

  /**
   * Action: Execute an action
   */
  private executeAction(
    node: BehaviorNode,
    context: AIContext
  ): { result: NodeResult; action: ActionResult | null } {
    const actionId = node.params.actionId as string;
    if (!actionId) {
      return { result: 'failure', action: null };
    }

    const action = executeAction(actionId, node.params, context);
    return { result: action ? 'success' : 'failure', action };
  }
}
