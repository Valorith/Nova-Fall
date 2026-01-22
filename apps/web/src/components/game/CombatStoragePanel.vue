<script setup lang="ts">
import { ref } from 'vue';
import type { DbItemDefinition } from '@nova-fall/shared';

export interface StorageItemEntry {
  itemId: string;
  amount: number;
  item: DbItemDefinition;
  type: 'unit' | 'building';
}

defineProps<{
  items: StorageItemEntry[];
  visible: boolean;
}>();

const panelRef = ref<HTMLElement | null>(null);

const emit = defineEmits<{
  (e: 'drag-start', item: StorageItemEntry, event: PointerEvent | MouseEvent): void;
  (e: 'drag-cancel', event: PointerEvent | MouseEvent): void;
  (e: 'toggle'): void;
}>();

// Check if icon is a URL/path (starts with / or http)
function isIconUrl(icon: string | null | undefined): boolean {
  if (!icon) return false;
  return icon.startsWith('/') || icon.startsWith('http');
}

const handleDragStart = (item: StorageItemEntry, event: PointerEvent | MouseEvent) => {
  emit('drag-start', item, event);
};

const handleDragCancel = (event: PointerEvent | MouseEvent) => {
  emit('drag-cancel', event);
};

defineExpose({ panelRef });
</script>

<template>
  <aside
    ref="panelRef"
    class="combat-storage"
    :class="{ open: visible }"
    @pointerup.stop.prevent="handleDragCancel($event as PointerEvent)"
    @mouseup.stop.prevent="handleDragCancel($event as MouseEvent)"
  >
    <button
      class="storage-handle"
      :class="{ open: visible }"
      @click="emit('toggle')"
    >
      <span class="handle-arrow">◀</span>
    </button>
    <div class="storage-header">
      <div>
        <h3>Node Storage</h3>
        <p>Drag to deploy</p>
      </div>
    </div>

    <div class="storage-list">
      <div
        v-for="item in items"
        :key="item.itemId"
        class="storage-item"
        @pointerdown.stop.prevent="handleDragStart(item, $event as PointerEvent)"
        @mousedown.stop.prevent="handleDragStart(item, $event as MouseEvent)"
      >
        <div class="item-icon" :style="{ backgroundColor: item.item.color }">
          <img
            v-if="item.item.icon && isIconUrl(item.item.icon)"
            :src="item.item.icon"
            :alt="item.item.name"
            class="icon-image"
          />
          <span v-else-if="item.item.icon" class="icon-text">{{ item.item.icon }}</span>
          <span v-else class="icon-text">📦</span>
        </div>
        <div class="item-info">
          <div class="item-name">{{ item.item.name }}</div>
          <div class="item-type">{{ item.type }}</div>
        </div>
        <div class="item-count">{{ item.amount }}</div>
      </div>
      <div v-if="!items.length" class="empty-state">No deployable items</div>
    </div>
  </aside>
</template>

<style scoped>
.combat-storage {
  position: absolute;
  top: 80px;
  right: 0;
  width: 280px;
  height: calc(100% - 120px);
  background: rgba(15, 18, 26, 0.95);
  border-left: 1px solid rgba(58, 74, 102, 0.5);
  transform: translateX(100%);
  transition: transform 0.25s ease;
  display: flex;
  flex-direction: column;
  z-index: 20;
  pointer-events: auto;
}

.combat-storage.open {
  transform: translateX(0);
}

.storage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(58, 74, 102, 0.4);
}

.storage-header h3 {
  margin: 0;
  font-size: 16px;
  color: #e5e7eb;
}

.storage-header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #9ca3af;
}

.storage-handle {
  position: absolute;
  left: -28px;
  top: 40%;
  width: 24px;
  height: 64px;
  background: rgba(17, 24, 39, 0.9);
  border: 1px solid rgba(58, 74, 102, 0.6);
  border-right: none;
  border-radius: 10px 0 0 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #94a3b8;
}

.storage-handle.open {
  background: rgba(15, 18, 26, 0.95);
}

.storage-handle .handle-arrow {
  display: inline-block;
  transform: rotate(0deg);
  transition: transform 0.2s ease;
}

.storage-handle.open .handle-arrow {
  transform: rotate(180deg);
}

.storage-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.storage-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: rgba(17, 24, 39, 0.8);
  border: 1px solid rgba(51, 65, 85, 0.5);
  border-radius: 10px;
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.storage-item:active {
  cursor: grabbing;
}

.item-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0f172a;
  font-weight: 600;
}

.icon-text {
  font-size: 16px;
}

.icon-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 6px;
}

.item-info {
  flex: 1;
}

.item-name {
  color: #f8fafc;
  font-size: 13px;
  font-weight: 600;
}

.item-type {
  font-size: 11px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.item-count {
  font-size: 14px;
  font-weight: 600;
  color: #38bdf8;
}

.empty-state {
  text-align: center;
  color: #64748b;
  font-size: 12px;
  padding: 20px 12px;
}
</style>
