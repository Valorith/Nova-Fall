<script setup lang="ts">
import { computed, inject } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { generateNodeTooltip, type NodeData } from '../utils/tooltipGenerator';

interface Props {
  id: string;
  data: {
    label: string;
    type: string;
    params: Record<string, unknown>;
    comment?: string;
    executionOrder?: number;
    dimmed?: boolean;
    collapsed?: boolean;
    subtreeCount?: number;
  };
  selected?: boolean;
}

const props = defineProps<Props>();

// Inject the toggle function from parent
const toggleNodeCollapse = inject<(nodeId: string) => void>('toggleNodeCollapse');

const childCount = computed(() => {
  return (props.data.params?.childCount as number) || 0;
});

const tooltip = computed(() => {
  return generateNodeTooltip(props.data as NodeData, childCount.value);
});

const isCollapsed = computed(() => props.data.collapsed ?? false);
const subtreeCount = computed(() => props.data.subtreeCount ?? 0);

function toggleCollapse(event: MouseEvent) {
  event.stopPropagation();
  if (toggleNodeCollapse) {
    toggleNodeCollapse(props.id);
  }
}
</script>

<template>
  <div
    class="sequence-node"
    :class="{ selected: props.selected, dimmed: props.data.dimmed, collapsed: isCollapsed }"
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

    <!-- Collapse toggle button -->
    <button
      v-if="childCount > 0"
      class="collapse-toggle"
      :title="isCollapsed ? 'Expand subtree' : 'Collapse subtree'"
      @click="toggleCollapse"
    >
      {{ isCollapsed ? '+' : '−' }}
    </button>

    <div class="node-header">
      <span class="node-icon">-></span>
      <span class="node-title">{{ data.label || 'Sequence' }}</span>
    </div>

    <div class="node-body">
      <template v-if="isCollapsed">
        <span class="collapsed-summary">{{ subtreeCount }} nodes collapsed</span>
      </template>
      <template v-else>
        <span class="node-description">Run in order</span>
        <span v-if="childCount > 0" class="child-count">{{ childCount }} children</span>
      </template>
    </div>

    <Handle v-if="!isCollapsed" type="source" :position="Position.Bottom" class="handle handle-source" />
  </div>
</template>

<style scoped>
.sequence-node {
  position: relative;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border: 2px solid #1d4ed8;
  border-radius: 8px;
  padding: 0;
  min-width: 140px;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  transition: all 0.15s ease;
}

.sequence-node.selected {
  border-color: #60a5fa;
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.5), 0 4px 12px rgba(59, 130, 246, 0.4);
}

.sequence-node:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
}

.sequence-node.dimmed {
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

.node-icon {
  width: 24px;
  height: 24px;
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
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}

.node-body {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.node-description {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
}

.child-count {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
}

.handle {
  width: 12px;
  height: 12px;
  background: #fff;
  border: 2px solid #1d4ed8;
  border-radius: 50%;
}

.handle-target {
  top: -6px;
}

.handle-source {
  bottom: -6px;
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

.collapse-toggle {
  position: absolute;
  bottom: -8px;
  right: 50%;
  transform: translateX(50%);
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1f2e;
  border: 2px solid #1d4ed8;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  z-index: 10;
  transition: all 0.15s;
}

.collapse-toggle:hover {
  background: #2a3040;
  transform: translateX(50%) scale(1.1);
}

.sequence-node.collapsed {
  border-style: dashed;
}

.sequence-node.collapsed .node-body {
  background: rgba(0, 0, 0, 0.1);
}

.collapsed-summary {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.9);
  font-style: italic;
}
</style>
