export { default as SelectorNode } from './SelectorNode.vue';
export { default as SequenceNode } from './SequenceNode.vue';
export { default as ParallelNode } from './ParallelNode.vue';
export { default as DecoratorNode } from './DecoratorNode.vue';
export { default as ConditionNode } from './ConditionNode.vue';
export { default as ActionNode } from './ActionNode.vue';

// Node type mapping for Vue Flow
export const nodeTypes = {
  selector: 'SelectorNode',
  sequence: 'SequenceNode',
  parallel: 'ParallelNode',
  inverter: 'DecoratorNode',
  succeeder: 'DecoratorNode',
  repeater: 'DecoratorNode',
  until_fail: 'DecoratorNode',
  condition: 'ConditionNode',
  action: 'ActionNode',
};

// Node color mapping
export const nodeColors: Record<string, string> = {
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
