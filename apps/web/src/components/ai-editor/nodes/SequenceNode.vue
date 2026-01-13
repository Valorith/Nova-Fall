<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';

interface Props {
  id: string;
  data: {
    label: string;
    type: string;
    params: Record<string, unknown>;
  };
  selected?: boolean;
}

const props = defineProps<Props>();

const childCount = computed(() => {
  return (props.data.params?.childCount as number) || 0;
});
</script>

<template>
  <div class="sequence-node" :class="{ selected: props.selected }">
    <Handle type="target" :position="Position.Top" class="handle handle-target" />

    <div class="node-header">
      <span class="node-icon">-></span>
      <span class="node-title">{{ data.label || 'Sequence' }}</span>
    </div>

    <div class="node-body">
      <span class="node-description">Run in order</span>
      <span v-if="childCount > 0" class="child-count">{{ childCount }} children</span>
    </div>

    <Handle type="source" :position="Position.Bottom" class="handle handle-source" />
  </div>
</template>

<style scoped>
.sequence-node {
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
</style>
