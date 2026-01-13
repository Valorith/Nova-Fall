<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';

interface Props {
  id: string;
  data: {
    label: string;
    type: string;
    conditionId?: string;
    params: Record<string, unknown>;
  };
  selected?: boolean;
}

const props = defineProps<Props>();

const conditionName = computed(() => {
  return props.data.label || props.data.conditionId || 'Condition';
});

const paramPreview = computed(() => {
  const params = props.data.params;
  if (!params) return '';

  // Show key param values
  const operator = params.operator as string;
  const value = params.value;
  const threshold = params.threshold;

  if (operator && value !== undefined) {
    return `${operator} ${value}`;
  }
  if (threshold !== undefined) {
    return `< ${threshold}%`;
  }
  return '';
});
</script>

<template>
  <div class="condition-node" :class="{ selected: props.selected }">
    <Handle type="target" :position="Position.Top" class="handle handle-target" />

    <div class="node-header">
      <span class="node-icon">?</span>
      <span class="node-title">{{ conditionName }}</span>
    </div>

    <div v-if="paramPreview" class="node-body">
      <span class="param-preview">{{ paramPreview }}</span>
    </div>

    <!-- Conditions are leaves - no source handle -->
  </div>
</template>

<style scoped>
.condition-node {
  background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
  border: 2px solid #0e7490;
  border-radius: 8px;
  padding: 0;
  min-width: 130px;
  box-shadow: 0 4px 12px rgba(6, 182, 212, 0.3);
  transition: all 0.15s ease;
}

.condition-node.selected {
  border-color: #22d3ee;
  box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.5), 0 4px 12px rgba(6, 182, 212, 0.4);
}

.condition-node:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(6, 182, 212, 0.4);
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
  border: 2px solid #0e7490;
  border-radius: 50%;
}

.handle-target {
  top: -5px;
}
</style>
