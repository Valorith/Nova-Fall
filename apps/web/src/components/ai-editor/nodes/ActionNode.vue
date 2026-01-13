<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { generateNodeTooltip, type NodeData } from '../utils/tooltipGenerator';

interface Props {
  id: string;
  data: {
    label: string;
    type: string;
    actionId?: string;
    params: Record<string, unknown>;
    comment?: string;
    executionOrder?: number;
    dimmed?: boolean;
  };
  selected?: boolean;
}

const props = defineProps<Props>();

const actionName = computed(() => {
  return props.data.label || props.data.actionId || 'Action';
});

const paramPreview = computed(() => {
  const params = props.data.params;
  if (!params) return '';

  // Show key param values
  const target = params.target as string;
  const filter = params.filter as string;
  const radius = params.radius as number;

  if (target) return target;
  if (filter) return filter;
  if (radius) return `r: ${radius}`;
  return '';
});

const tooltip = computed(() => {
  return generateNodeTooltip(props.data as NodeData, 0);
});
</script>

<template>
  <div
    class="action-node"
    :class="{ selected: props.selected, dimmed: props.data.dimmed }"
    :title="tooltip"
  >
    <Handle type="target" :position="Position.Top" class="handle handle-target" />

    <!-- Comment indicator -->
    <span v-if="data.comment" class="comment-indicator" :title="data.comment">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2z" />
      </svg>
    </span>

    <!-- Execution order badge -->
    <span v-if="data.executionOrder" class="execution-badge">
      {{ data.executionOrder }}
    </span>

    <div class="node-header">
      <span class="node-icon">!</span>
      <span class="node-title">{{ actionName }}</span>
    </div>

    <div v-if="paramPreview" class="node-body">
      <span class="param-preview">{{ paramPreview }}</span>
    </div>

    <!-- Source handle for Sequence chaining (visual only - actions are still leaves in the behavior tree) -->
    <!-- No id attribute so this becomes the default source handle -->
    <Handle type="source" :position="Position.Bottom" class="handle handle-source" />
  </div>
</template>

<style scoped>
.action-node {
  position: relative;
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  border: 2px solid #15803d;
  border-radius: 8px;
  padding: 0;
  min-width: 130px;
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
  transition: all 0.15s ease;
}

.action-node.selected {
  border-color: #4ade80;
  box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.5), 0 4px 12px rgba(34, 197, 94, 0.4);
}

.action-node:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(34, 197, 94, 0.4);
}

.action-node.dimmed {
  opacity: 0.4;
  filter: grayscale(40%);
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 6px 6px 0 0;
}

.node-header:only-child {
  border-radius: 6px;
}

.node-icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
}

.node-title {
  font-size: 12px;
  font-weight: 600;
  color: #fff;
}

.node-body {
  padding: 6px 12px 8px;
}

.param-preview {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
  font-family: 'Monaco', 'Menlo', monospace;
}

.handle {
  width: 10px;
  height: 10px;
  background: #fff;
  border: 2px solid #15803d;
  border-radius: 50%;
}

.handle-target {
  top: -5px;
}

.handle-source {
  bottom: -5px;
}

.comment-indicator {
  position: absolute;
  top: -6px;
  left: -6px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #6b7280;
  border-radius: 50%;
  color: #fff;
  z-index: 10;
  cursor: help;
}

.execution-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3b82f6;
  border: 2px solid #1d4ed8;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  z-index: 10;
}
</style>
