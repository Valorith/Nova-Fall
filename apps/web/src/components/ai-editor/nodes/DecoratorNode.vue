<script setup lang="ts">
import { computed } from 'vue';
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
  };
  selected?: boolean;
}

const props = defineProps<Props>();

const decoratorType = computed(() => {
  return props.data.type || 'inverter';
});

const icon = computed(() => {
  const icons: Record<string, string> = {
    inverter: '!',
    succeeder: 'S',
    repeater: '@',
    until_fail: 'U',
  };
  return icons[decoratorType.value] || '?';
});

const description = computed(() => {
  const descriptions: Record<string, string> = {
    inverter: 'Flip result',
    succeeder: 'Always succeed',
    repeater: `Repeat ${props.data.params?.count || 'N'} times`,
    until_fail: 'Repeat until fail',
  };
  return descriptions[decoratorType.value] || 'Decorator';
});

const tooltip = computed(() => {
  return generateNodeTooltip(props.data as NodeData, 0);
});
</script>

<template>
  <div
    class="decorator-node"
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

    <div class="node-content">
      <div class="node-icon">{{ icon }}</div>
      <div class="node-info">
        <span class="node-title">{{ data.label || decoratorType }}</span>
        <span class="node-description">{{ description }}</span>
      </div>
    </div>

    <Handle type="source" :position="Position.Bottom" class="handle handle-source" />
  </div>
</template>

<style scoped>
.decorator-node {
  position: relative;
  background: linear-gradient(135deg, #eab308 0%, #ca8a04 100%);
  border: 2px solid #a16207;
  border-radius: 8px;
  padding: 10px 14px;
  min-width: 120px;
  box-shadow: 0 4px 12px rgba(234, 179, 8, 0.3);
  transition: all 0.15s ease;
}

.decorator-node.selected {
  border-color: #fcd34d;
  box-shadow: 0 0 0 2px rgba(252, 211, 77, 0.5), 0 4px 12px rgba(234, 179, 8, 0.4);
}

.decorator-node:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(234, 179, 8, 0.4);
}

.decorator-node.dimmed {
  opacity: 0.4;
  filter: grayscale(40%);
}

.node-content {
  display: flex;
  align-items: center;
  gap: 10px;
}

.node-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
}

.node-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.node-title {
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  text-transform: capitalize;
}

.node-description {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.75);
}

.handle {
  width: 10px;
  height: 10px;
  background: #fff;
  border: 2px solid #a16207;
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
