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
</script>

<template>
  <div class="decorator-node" :class="{ selected: props.selected }">
    <Handle type="target" :position="Position.Top" class="handle handle-target" />

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
  background: linear-gradient(135deg, #eab308 0%, #ca8a04 100%);
  border: 2px solid #a16207;
  border-radius: 8px;
  padding: 10px 14px;
  min-width: 120px;
  box-shadow: 0 4px 12px rgba(234, 179, 8, 0.3);
  transition: all 0.15s ease;
  /* Diamond-like shape via clip-path or just rounded for now */
}

.decorator-node.selected {
  border-color: #fcd34d;
  box-shadow: 0 0 0 2px rgba(252, 211, 77, 0.5), 0 4px 12px rgba(234, 179, 8, 0.4);
}

.decorator-node:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(234, 179, 8, 0.4);
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
</style>
