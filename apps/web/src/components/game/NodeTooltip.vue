<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { MapNode } from '@nova-fall/shared';
import { NODE_TYPE_CONFIGS, NodeStatus, UpkeepStatus } from '@nova-fall/shared';

const props = defineProps<{
  node: MapNode | null;
  screenX: number;
  screenY: number;
}>();

const tooltipRef = ref<HTMLDivElement | null>(null);
const isVisible = ref(false);

// Offset from cursor
const OFFSET_X = 16;
const OFFSET_Y = 16;

// Get node type config
const nodeConfig = computed(() => {
  if (!props.node) return null;
  return NODE_TYPE_CONFIGS[props.node.type];
});

// Get icon emoji for node type
function getNodeIcon(icon: string): string {
  const iconMap: Record<string, string> = {
    mining: '\u26CF\uFE0F',      // Pick
    refinery: '\u2699\uFE0F',    // Gear
    research: '\uD83D\uDD2C',    // Microscope
    trade: '\uD83D\uDCB0',       // Money bag
    fortress: '\uD83C\uDFF0',    // Castle
    agricultural: '\uD83C\uDF3E', // Wheat
    power: '\u26A1',             // Lightning
    capital: '\u2B50',           // Star
  };
  return iconMap[icon] || '\uD83D\uDFE2'; // Default green circle
}

// Get status display info
const statusInfo = computed(() => {
  if (!props.node) return { label: '', color: '' };

  switch (props.node.status) {
    case NodeStatus.NEUTRAL:
      return { label: 'Neutral', color: 'text-gray-400' };
    case NodeStatus.CLAIMED:
      return { label: 'Claimed', color: 'text-green-400' };
    case NodeStatus.UNDER_ATTACK:
      return { label: 'Under Attack', color: 'text-red-400' };
    case NodeStatus.CONTESTED:
      return { label: 'Contested', color: 'text-yellow-400' };
    default:
      return { label: 'Unknown', color: 'text-gray-400' };
  }
});

// Get upkeep status display info
const upkeepInfo = computed(() => {
  if (!props.node?.upkeepStatus) return null;

  switch (props.node.upkeepStatus) {
    case UpkeepStatus.PAID:
      return null; // Don't show if paid
    case UpkeepStatus.WARNING:
      return { label: 'Upkeep Warning', color: 'warning', icon: '\u26A0\uFE0F' };
    case UpkeepStatus.DECAY:
      return { label: 'Decaying', color: 'danger', icon: '\uD83D\uDEA8' };
    case UpkeepStatus.COLLAPSE:
      return { label: 'Collapsing', color: 'critical', icon: '\u2620\uFE0F' };
    case UpkeepStatus.ABANDONED:
      return { label: 'Abandoned', color: 'critical', icon: '\uD83D\uDEAB' };
    default:
      return null;
  }
});

// Update position using direct DOM manipulation for performance
function updatePosition() {
  if (!tooltipRef.value || !props.node) return;

  const tooltip = tooltipRef.value;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const tooltipRect = tooltip.getBoundingClientRect();

  let x = props.screenX + OFFSET_X;
  let y = props.screenY + OFFSET_Y;

  // Flip horizontally if would overflow right edge
  if (x + tooltipRect.width > viewportWidth - 10) {
    x = props.screenX - tooltipRect.width - OFFSET_X;
  }

  // Flip vertically if would overflow bottom edge
  if (y + tooltipRect.height > viewportHeight - 10) {
    y = props.screenY - tooltipRect.height - OFFSET_Y;
  }

  // Clamp to viewport
  x = Math.max(10, Math.min(x, viewportWidth - tooltipRect.width - 10));
  y = Math.max(10, Math.min(y, viewportHeight - tooltipRect.height - 10));

  tooltip.style.transform = `translate(${x}px, ${y}px)`;
}

// Watch for node changes
watch(() => props.node, (newNode) => {
  isVisible.value = !!newNode;
  if (newNode) {
    // Use requestAnimationFrame for smooth position updates
    requestAnimationFrame(updatePosition);
  }
}, { immediate: true });

// Watch for position changes
watch([() => props.screenX, () => props.screenY], () => {
  if (props.node) {
    requestAnimationFrame(updatePosition);
  }
});

// Handle window resize
onMounted(() => {
  window.addEventListener('resize', updatePosition);
});

onUnmounted(() => {
  window.removeEventListener('resize', updatePosition);
});
</script>

<template>
  <Teleport to="body">
    <div
      ref="tooltipRef"
      class="node-tooltip"
      :class="{ 'node-tooltip--visible': isVisible && node }"
    >
      <template v-if="node && nodeConfig">
        <!-- Header -->
        <div class="node-tooltip__header">
          <span class="node-tooltip__icon">{{ getNodeIcon(nodeConfig.icon) }}</span>
          <div class="node-tooltip__title">
            <h3 class="node-tooltip__name">{{ node.name }}</h3>
            <span class="node-tooltip__type">{{ nodeConfig.displayName }}</span>
          </div>
        </div>

        <!-- Stats -->
        <div class="node-tooltip__stats">
          <div class="node-tooltip__stat">
            <span class="node-tooltip__stat-label">Tier</span>
            <span class="node-tooltip__stat-value">{{ node.tier }}</span>
          </div>
          <div class="node-tooltip__stat">
            <span class="node-tooltip__stat-label">Status</span>
            <span class="node-tooltip__stat-value" :class="statusInfo.color">{{ statusInfo.label }}</span>
          </div>
          <div class="node-tooltip__stat">
            <span class="node-tooltip__stat-label">Upkeep</span>
            <span class="node-tooltip__stat-value text-yellow-400">{{ nodeConfig.baseUpkeep }}/hr</span>
          </div>
        </div>

        <!-- Owner -->
        <div v-if="node.ownerId" class="node-tooltip__owner">
          <span class="node-tooltip__owner-label">Owner:</span>
          <span class="node-tooltip__owner-name">{{ node.ownerName || 'Unknown' }}</span>
          <span v-if="node.isHQ" class="node-tooltip__hq-badge">HQ</span>
        </div>

        <!-- Upkeep Warning -->
        <div v-if="upkeepInfo" class="node-tooltip__upkeep-warning" :class="`node-tooltip__upkeep-warning--${upkeepInfo.color}`">
          <span class="node-tooltip__upkeep-icon">{{ upkeepInfo.icon }}</span>
          <span class="node-tooltip__upkeep-label">{{ upkeepInfo.label }}</span>
        </div>

        <!-- Bonuses -->
        <div v-if="nodeConfig.resourceBonuses && Object.keys(nodeConfig.resourceBonuses).length > 0" class="node-tooltip__bonuses">
          <template v-for="(value, key) in nodeConfig.resourceBonuses" :key="key">
            <div v-if="value && value !== 1" class="node-tooltip__bonus">
              <span class="node-tooltip__bonus-icon">+</span>
              <span>{{ Math.round((value - 1) * 100) }}% {{ key }}</span>
            </div>
          </template>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.node-tooltip {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
  pointer-events: none;
  opacity: 0;
  transform: translate(-9999px, -9999px);
  transition: opacity 0.1s ease-out;
  will-change: transform, opacity;
}

.node-tooltip--visible {
  opacity: 1;
}

.node-tooltip__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.98), rgba(15, 23, 42, 0.98));
  border-radius: 0.5rem 0.5rem 0 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.node-tooltip__icon {
  font-size: 1.5rem;
  line-height: 1;
}

.node-tooltip__title {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.node-tooltip__name {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: #f1f5f9;
  line-height: 1.2;
}

.node-tooltip__type {
  font-size: 0.75rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.node-tooltip__stats {
  display: flex;
  gap: 1rem;
  padding: 0.625rem 0.75rem;
  background: rgba(15, 23, 42, 0.95);
}

.node-tooltip__stat {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.node-tooltip__stat-label {
  font-size: 0.625rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.node-tooltip__stat-value {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #e2e8f0;
}

.node-tooltip__owner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(15, 23, 42, 0.95);
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.node-tooltip__owner-label {
  font-size: 0.6875rem;
  color: #64748b;
}

.node-tooltip__owner-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #a5b4fc;
}

.node-tooltip__hq-badge {
  margin-left: auto;
  padding: 0.125rem 0.375rem;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #1e1b4b;
  font-size: 0.625rem;
  font-weight: 700;
  border-radius: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.node-tooltip__bonuses {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  background: rgba(15, 23, 42, 0.95);
  border-radius: 0 0 0.5rem 0.5rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.node-tooltip__bonus {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 0.25rem;
  font-size: 0.6875rem;
  color: #86efac;
}

.node-tooltip__bonus-icon {
  font-weight: 700;
  color: #4ade80;
}

/* Upkeep Warning */
.node-tooltip__upkeep-warning {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.node-tooltip__upkeep-warning--warning {
  background: rgba(234, 179, 8, 0.15);
  color: #fcd34d;
}

.node-tooltip__upkeep-warning--danger {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
}

.node-tooltip__upkeep-warning--critical {
  background: rgba(239, 68, 68, 0.25);
  color: #fecaca;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.node-tooltip__upkeep-icon {
  font-size: 1rem;
}

.node-tooltip__upkeep-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Shadow and border for the whole tooltip */
.node-tooltip--visible {
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.3),
    0 2px 4px -1px rgba(0, 0, 0, 0.2),
    0 0 0 1px rgba(148, 163, 184, 0.1);
  border-radius: 0.5rem;
}
</style>
