<script setup lang="ts">
import { computed } from 'vue';
import type { Node, Edge } from '@vue-flow/core';
import type { BehaviorNodeType } from '@nova-fall/shared';
import { CONDITION_DEFINITIONS, ACTION_DEFINITIONS } from '@nova-fall/shared';

interface Props {
  nodes: Node[];
  edges: Edge[];
}

const props = defineProps<Props>();

// Scope colors for different composite/decorator types
const SCOPE_COLORS = {
  selector: '#f59e0b',   // Orange
  sequence: '#3b82f6',   // Blue
  parallel: '#a855f7',   // Purple
  repeater: '#ef4444',   // Red (loop)
  until_fail: '#ef4444', // Red (loop)
  inverter: '#eab308',   // Yellow
  succeeder: '#eab308',  // Yellow
  root: '#6b7280',       // Gray
} as const;

type ScopeColorKey = keyof typeof SCOPE_COLORS;

function getScopeColor(type: string): string {
  if (type in SCOPE_COLORS) {
    return SCOPE_COLORS[type as ScopeColorKey];
  }
  return SCOPE_COLORS.root;
}

interface ScopeInfo {
  color: string;
  isLoop: boolean;
  type: string;
}

interface LogicStep {
  id: string;
  depth: number;
  type: 'check' | 'action' | 'composite' | 'decorator';
  text: string;
  outcomes?: { condition: string; text: string }[];
  scopes: ScopeInfo[];  // Stack of parent scopes for drawing lines
  isLastInScope: boolean;
  isLoopStart?: boolean;
  loopLabel?: string;
}

// Build adjacency map for efficient child lookup
function buildChildrenMap(): Map<string, Node[]> {
  const childrenMap = new Map<string, Node[]>();
  for (const node of props.nodes) {
    childrenMap.set(node.id, []);
  }
  for (const edge of props.edges) {
    const children = childrenMap.get(edge.source);
    const childNode = props.nodes.find((n) => n.id === edge.target);
    if (children && childNode) {
      children.push(childNode);
    }
  }
  // Sort children by x position for consistent ordering
  for (const [, children] of childrenMap) {
    children.sort((a, b) => a.position.x - b.position.x);
  }
  return childrenMap;
}

// Generate readable condition description
function describeCondition(node: Node): string {
  const conditionId = node.data.conditionId as string;
  const params = (node.data.params as Record<string, unknown>) || {};
  const def = CONDITION_DEFINITIONS.find((d) => d.id === conditionId);

  if (!def) return node.data.label || 'Condition';

  switch (conditionId) {
    case 'health_check': {
      const op = formatOperator(params.operator as string);
      const val = params.value ?? 50;
      const isPercent = params.type !== 'absolute';
      return `Health is ${op} ${val}${isPercent ? '%' : ''}`;
    }
    case 'shield_check': {
      const op = formatOperator(params.operator as string);
      const val = params.value ?? 50;
      return `Shield is ${op} ${val}%`;
    }
    case 'has_target':
      return 'Has active target';
    case 'target_in_range':
      return 'Target is in range';
    case 'enemy_count': {
      const op = formatOperator(params.operator as string);
      const val = params.value ?? 0;
      return `Enemy count ${op} ${val}`;
    }
    case 'cooldown_ready':
      return 'Attack cooldown ready';
    case 'random_chance': {
      const percent = params.percent ?? 50;
      return `${percent}% chance`;
    }
    default:
      return node.data.label || def.name;
  }
}

// Generate readable action description
function describeAction(node: Node): string {
  const actionId = node.data.actionId as string;
  const params = (node.data.params as Record<string, unknown>) || {};
  const def = ACTION_DEFINITIONS.find((d) => d.id === actionId);

  if (!def) return node.data.label || 'Action';

  switch (actionId) {
    case 'attack_target':
      return 'Attack target';
    case 'attack_nearest': {
      const filter = params.filter ?? 'any';
      return filter === 'any' ? 'Attack nearest enemy' : `Attack nearest ${filter}`;
    }
    case 'move_to_target':
      return 'Move toward target';
    case 'follow_flow_field':
      return 'Move toward enemy core';
    case 'retreat_to_spawn':
      return 'Retreat to spawn';
    case 'hold_position':
      return 'Hold position';
    case 'set_target': {
      const filter = params.filter ?? 'nearest';
      return `Set target: ${filter}`;
    }
    default:
      return node.data.label || def.name;
  }
}

function formatOperator(op: string): string {
  const ops: Record<string, string> = {
    '<': 'less than',
    '<=': 'at most',
    '>': 'greater than',
    '>=': 'at least',
    '==': 'equal to',
  };
  return ops[op] || op;
}

// Generate logic flow from tree
const logicFlow = computed((): LogicStep[] => {
  if (props.nodes.length === 0) return [];

  // Find root node
  const nodesWithIncoming = new Set(props.edges.map((e) => e.target));
  const root = props.nodes.find((n) => !nodesWithIncoming.has(n.id));
  if (!root) return [];

  const childrenMap = buildChildrenMap();
  const steps: LogicStep[] = [];
  let stepNum = 1;

  function traverseNode(
    node: Node,
    depth: number,
    scopes: ScopeInfo[],
    isLast: boolean
  ) {
    const type = node.data.type as BehaviorNodeType;
    const children = childrenMap.get(node.id) || [];
    const isLoop = type === 'repeater' || type === 'until_fail';

    if (type === 'selector') {
      steps.push({
        id: node.id,
        depth,
        type: 'composite',
        text: `${stepNum++}. Try options (first success wins):`,
        scopes: [...scopes],
        isLastInScope: isLast,
      });
      const selectorScope: ScopeInfo = { color: getScopeColor('selector'), isLoop: false, type: 'selector' };
      const newScopes: ScopeInfo[] = [...scopes, selectorScope];
      children.forEach((child, idx) => {
        const childType = child.data.type as BehaviorNodeType;
        const childIsLast = idx === children.length - 1;
        if (childType === 'condition') {
          const condChild = children[idx + 1];
          const step: LogicStep = {
            id: child.id,
            depth: depth + 1,
            type: 'check',
            text: `Check: ${describeCondition(child)}`,
            scopes: newScopes,
            isLastInScope: childIsLast,
          };
          if (condChild) {
            step.outcomes = [
              { condition: 'If true', text: describeNextAction(condChild, childrenMap) },
              { condition: 'If false', text: 'Try next option' },
            ];
          }
          steps.push(step);
        } else {
          traverseNode(child, depth + 1, newScopes, childIsLast);
        }
      });
    } else if (type === 'sequence') {
      steps.push({
        id: node.id,
        depth,
        type: 'composite',
        text: `${stepNum++}. Execute in order (until failure):`,
        scopes: [...scopes],
        isLastInScope: isLast,
      });
      const sequenceScope: ScopeInfo = { color: getScopeColor('sequence'), isLoop: false, type: 'sequence' };
      const newScopes: ScopeInfo[] = [...scopes, sequenceScope];
      children.forEach((child, idx) => {
        traverseNode(child, depth + 1, newScopes, idx === children.length - 1);
      });
    } else if (type === 'condition') {
      steps.push({
        id: node.id,
        depth,
        type: 'check',
        text: `${stepNum++}. Check: ${describeCondition(node)}`,
        scopes: [...scopes],
        isLastInScope: isLast,
      });
    } else if (type === 'action') {
      steps.push({
        id: node.id,
        depth,
        type: 'action',
        text: `${stepNum++}. ${describeAction(node)}`,
        scopes: [...scopes],
        isLastInScope: isLast,
      });
    } else if (['inverter', 'succeeder', 'repeater', 'until_fail'].includes(type)) {
      const decoratorDesc = getDecoratorDescription(type, node.data.params as Record<string, unknown>);
      const step: LogicStep = {
        id: node.id,
        depth,
        type: 'decorator',
        text: `${stepNum++}. ${decoratorDesc}:`,
        scopes: [...scopes],
        isLastInScope: isLast,
      };
      if (isLoop) {
        step.isLoopStart = true;
        step.loopLabel = type === 'repeater' ? `×${(node.data.params as Record<string, unknown>)?.count ?? 3}` : '∞';
      }
      steps.push(step);
      const scopeColor = getScopeColor(type);
      const newScope: ScopeInfo = { color: scopeColor, isLoop, type };
      const newScopes: ScopeInfo[] = [...scopes, newScope];
      children.forEach((child, idx) => {
        traverseNode(child, depth + 1, newScopes, idx === children.length - 1);
      });
    } else if (type === 'parallel') {
      steps.push({
        id: node.id,
        depth,
        type: 'composite',
        text: `${stepNum++}. Run simultaneously:`,
        scopes: [...scopes],
        isLastInScope: isLast,
      });
      const parallelScope: ScopeInfo = { color: getScopeColor('parallel'), isLoop: false, type: 'parallel' };
      const newScopes: ScopeInfo[] = [...scopes, parallelScope];
      children.forEach((child, idx) => {
        traverseNode(child, depth + 1, newScopes, idx === children.length - 1);
      });
    }
  }

  function describeNextAction(node: Node, cMap: Map<string, Node[]>): string {
    const type = node.data.type as BehaviorNodeType;
    if (type === 'action') {
      return describeAction(node);
    } else if (type === 'sequence') {
      const children = cMap.get(node.id) || [];
      const firstChild = children[0];
      if (firstChild) {
        return describeNextAction(firstChild, cMap);
      }
    }
    return node.data.label || type;
  }

  function getDecoratorDescription(type: string, params: Record<string, unknown>): string {
    switch (type) {
      case 'inverter':
        return 'Invert result';
      case 'succeeder':
        return 'Always succeed';
      case 'repeater':
        return `Repeat ${params?.count ?? 3} times`;
      case 'until_fail':
        return 'Repeat until failure';
      default:
        return 'Decorator';
    }
  }

  traverseNode(root, 0, [], true);
  return steps;
});

const hasContent = computed(() => logicFlow.value.length > 0);

// Check if any step has a loop scope
function hasLoopInScopes(scopes: ScopeInfo[]): boolean {
  return scopes.some(s => s.isLoop);
}
</script>

<template>
  <div class="logic-description-panel">
    <div class="panel-header">
      <h4>Logic Flow</h4>
    </div>

    <div v-if="!hasContent" class="empty-state">
      <p>Add nodes to see the logic flow</p>
    </div>

    <div v-else class="logic-steps">
      <div
        v-for="step in logicFlow"
        :key="step.id"
        class="logic-step"
        :class="[step.type, { 'in-loop': hasLoopInScopes(step.scopes) }]"
      >
        <!-- Scope lines container -->
        <div class="scope-lines">
          <div
            v-for="(scope, idx) in step.scopes"
            :key="idx"
            class="scope-line"
            :class="{
              'is-loop': scope.isLoop,
              'is-last': idx === step.scopes.length - 1 && step.isLastInScope
            }"
            :style="{ backgroundColor: scope.color }"
          />
        </div>

        <!-- Loop indicator icons -->
        <span v-if="step.isLoopStart" class="loop-badge" :title="step.loopLabel === '∞' ? 'Loop until failure' : `Loop ${step.loopLabel} times`">
          🔄 {{ step.loopLabel }}
        </span>

        <!-- Loop end indicator -->
        <span
          v-else-if="step.scopes.length > 0 && step.scopes[step.scopes.length - 1]?.isLoop && step.isLastInScope"
          class="loop-end-badge"
          title="Loop back to start"
        >
          ↩️
        </span>

        <!-- Step content -->
        <div class="step-content">
          <span class="step-text">{{ step.text }}</span>
          <div v-if="step.outcomes" class="outcomes">
            <div v-for="outcome in step.outcomes" :key="outcome.condition" class="outcome">
              <span class="outcome-arrow">→</span>
              <span class="outcome-condition">{{ outcome.condition }}:</span>
              <span class="outcome-text">{{ outcome.text }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.logic-description-panel {
  background: #151a24;
  border-radius: 0;
  overflow: hidden;
  border-top: 1px solid #2a3040;
}

.panel-header {
  padding: 12px 16px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a3040;
}

.panel-header h4 {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.empty-state {
  padding: 24px 16px;
  text-align: center;
  color: #6b7280;
}

.empty-state p {
  margin: 0;
  font-size: 13px;
}

.logic-steps {
  padding: 8px 0;
  max-height: 400px;
  overflow-y: auto;
}

.logic-step {
  display: flex;
  align-items: flex-start;
  padding: 4px 12px 4px 0;
  font-size: 12px;
  line-height: 1.4;
  position: relative;
}

.logic-step.in-loop {
  background: rgba(239, 68, 68, 0.05);
}

/* Scope lines container */
.scope-lines {
  display: flex;
  flex-shrink: 0;
  padding-right: 8px;
  min-width: 12px;
}

.scope-line {
  width: 3px;
  min-height: 24px;
  margin-right: 4px;
  border-radius: 1px;
  position: relative;
  align-self: stretch;
}

.scope-line.is-loop {
  width: 4px;
  border-radius: 2px;
  box-shadow: 0 0 4px currentColor;
}

.scope-line.is-last {
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
}

/* Loop badge at start of loop */
.loop-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 36px;
  height: 18px;
  padding: 0 6px;
  background: #ef4444;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  margin-right: 6px;
  flex-shrink: 0;
}

/* Loop end indicator */
.loop-end-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  margin-right: 6px;
  flex-shrink: 0;
}

/* Step content */
.step-content {
  flex: 1;
  min-width: 0;
}

.step-text {
  display: block;
}

.logic-step.check .step-text {
  color: #06b6d4;
}

.logic-step.action .step-text {
  color: #22c55e;
}

.logic-step.composite .step-text {
  color: #f59e0b;
  font-weight: 500;
}

.logic-step.decorator .step-text {
  color: #eab308;
}

.outcomes {
  margin-top: 4px;
  margin-left: 12px;
}

.outcome {
  display: flex;
  gap: 6px;
  font-size: 11px;
  color: #9ca3af;
  padding: 2px 0;
}

.outcome-arrow {
  color: #4b5563;
}

.outcome-condition {
  color: #eab308;
  font-weight: 500;
}

.outcome-text {
  color: #d1d5db;
}
</style>
