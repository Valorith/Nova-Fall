<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { MapNode, ResourceType } from '@nova-fall/shared';
import { NODE_TYPE_CONFIGS, NODE_CLAIM_COST_BY_TIER, NodeStatus, NodeType, UpkeepStatus, RESOURCES } from '@nova-fall/shared';

const props = defineProps<{
  node: MapNode | null;
  screenX: number;
  screenY: number;
}>();

const tooltipRef = ref<HTMLDivElement | null>(null);
const isVisible = ref(false);

// Crown countdown timer
const CROWN_HOLD_DURATION = 48 * 60 * 60 * 1000; // 48 hours in ms
const now = ref(Date.now());
let countdownInterval: ReturnType<typeof setInterval> | null = null;

// Offset from cursor
const OFFSET_X = 16;
const OFFSET_Y = 16;

// Check if node is the crown
const isCrownNode = computed(() => {
  return props.node?.type === NodeType.CROWN || props.node?.isCrown;
});

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
    barracks: '\u2694\uFE0F',     // Crossed swords
    agricultural: '\uD83C\uDF3E', // Wheat
    power: '\u26A1',             // Lightning
    capital: '\u2B50',           // Star
    crown: '\uD83D\uDC51',       // Crown
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

// Get claim cost for neutral nodes
const claimCost = computed(() => {
  if (!props.node) return 0;
  return NODE_CLAIM_COST_BY_TIER[props.node.tier] ?? NODE_CLAIM_COST_BY_TIER[1] ?? 100;
});

// Check if node can be claimed (is neutral)
const canBeClaimed = computed(() => {
  return props.node?.status === NodeStatus.NEUTRAL && !props.node?.ownerId;
});

// Get node resources that have non-zero values
const nodeResources = computed(() => {
  if (!props.node?.storage) return [];

  const resources: Array<{ type: ResourceType; amount: number; icon: string; name: string }> = [];

  for (const [type, amount] of Object.entries(props.node.storage)) {
    if (amount && amount > 0) {
      const resourceDef = RESOURCES[type as ResourceType];
      if (resourceDef) {
        resources.push({
          type: type as ResourceType,
          amount,
          icon: resourceDef.icon,
          name: resourceDef.name,
        });
      }
    }
  }

  return resources;
});

// Check if node has any resources
const hasResources = computed(() => nodeResources.value.length > 0);

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

// Crown countdown calculations
const crownClaimedAt = computed(() => {
  if (!props.node?.claimedAt || !isCrownNode.value) return null;
  return new Date(props.node.claimedAt).getTime();
});

const crownTimeRemaining = computed(() => {
  if (!crownClaimedAt.value) return null;
  const elapsed = now.value - crownClaimedAt.value;
  const remaining = CROWN_HOLD_DURATION - elapsed;
  return Math.max(0, remaining);
});

const crownProgress = computed(() => {
  if (!crownClaimedAt.value) return 0;
  const elapsed = now.value - crownClaimedAt.value;
  return Math.min(100, (elapsed / CROWN_HOLD_DURATION) * 100);
});

const crownCountdownDisplay = computed(() => {
  if (crownTimeRemaining.value === null || crownTimeRemaining.value <= 0) return null;

  const totalSeconds = Math.floor(crownTimeRemaining.value / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
});

// Start/stop countdown timer based on crown state
function startCountdownTimer() {
  if (!countdownInterval) {
    countdownInterval = setInterval(() => {
      now.value = Date.now();
    }, 1000);
  }
}

function stopCountdownTimer() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

// Watch for crown node with owner to start/stop timer
watch([isCrownNode, () => props.node?.ownerId], ([isCrown, ownerId]) => {
  if (isCrown && ownerId) {
    startCountdownTimer();
  } else {
    stopCountdownTimer();
  }
}, { immediate: true });

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
  stopCountdownTimer();
});
</script>

<template>
  <Teleport to="body">
    <div
      ref="tooltipRef"
      class="node-tooltip"
      :class="{
        'node-tooltip--visible': isVisible && node,
        'node-tooltip--crown': isCrownNode
      }"
    >
      <template v-if="node && nodeConfig">
        <!-- Crown Node Special Tooltip -->
        <template v-if="isCrownNode">
          <!-- Crown Header -->
          <div class="crown-tooltip__header">
            <span class="crown-tooltip__icon">&#x1F451;</span>
            <div class="crown-tooltip__title">
              <h3 class="crown-tooltip__name">King of the Hill</h3>
              <span class="crown-tooltip__subtitle">Game Objective</span>
            </div>
          </div>

          <!-- Crown Description -->
          <div class="crown-tooltip__description">
            <p>Control this sacred site for <strong>48 hours</strong> to claim victory.</p>
            <p class="crown-tooltip__flavor">All factions will fight for dominance here.</p>
          </div>

          <!-- Crown Status -->
          <div class="crown-tooltip__status">
            <div class="crown-tooltip__stat">
              <span class="crown-tooltip__stat-label">Status</span>
              <span class="crown-tooltip__stat-value" :class="statusInfo.color">{{ statusInfo.label }}</span>
            </div>
          </div>

          <!-- Crown Holder -->
          <div v-if="node.ownerId" class="crown-tooltip__holder">
            <span class="crown-tooltip__holder-icon">&#x2694;&#xFE0F;</span>
            <div class="crown-tooltip__holder-info">
              <span class="crown-tooltip__holder-label">Controlled by</span>
              <span class="crown-tooltip__holder-name">{{ node.ownerName || 'Unknown' }}</span>
            </div>
          </div>

          <!-- Crown Countdown (when claimed) -->
          <div v-if="node.ownerId && crownCountdownDisplay" class="crown-tooltip__countdown">
            <div class="crown-tooltip__countdown-header">
              <span class="crown-tooltip__countdown-icon">&#x23F1;&#xFE0F;</span>
              <span class="crown-tooltip__countdown-label">Victory in</span>
              <span class="crown-tooltip__countdown-time">{{ crownCountdownDisplay }}</span>
            </div>
            <div class="crown-tooltip__progress-bar">
              <div
                class="crown-tooltip__progress-fill"
                :style="{ width: `${crownProgress}%` }"
              ></div>
            </div>
            <div class="crown-tooltip__progress-text">
              {{ crownProgress.toFixed(1) }}% complete
            </div>
          </div>

          <div v-else-if="!node.ownerId" class="crown-tooltip__unclaimed">
            <span class="crown-tooltip__unclaimed-icon">&#x2728;</span>
            <span class="crown-tooltip__unclaimed-text">Unclaimed - Capture to begin your reign!</span>
          </div>
        </template>

        <!-- Standard Node Tooltip -->
        <template v-else>
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

          <!-- Node Resources -->
          <div v-if="hasResources" class="node-tooltip__resources">
            <div class="node-tooltip__resources-header">
              <span class="node-tooltip__resources-icon">&#x1F4E6;</span>
              <span class="node-tooltip__resources-label">Storage</span>
            </div>
            <div class="node-tooltip__resources-list">
              <div
                v-for="resource in nodeResources"
                :key="resource.type"
                class="node-tooltip__resource"
              >
                <span class="node-tooltip__resource-icon">{{ resource.icon }}</span>
                <span class="node-tooltip__resource-amount">{{ resource.amount.toLocaleString() }}</span>
              </div>
            </div>
          </div>

          <!-- Claim Cost (for neutral nodes) -->
          <div v-if="canBeClaimed" class="node-tooltip__claim-cost">
            <span class="node-tooltip__claim-cost-label">Claim Cost:</span>
            <span class="node-tooltip__claim-cost-value">{{ claimCost }} Credits</span>
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

          <!-- Trade Hub Feature -->
          <div v-if="node.type === NodeType.TRADE_HUB" class="node-tooltip__feature">
            <span class="node-tooltip__feature-icon">&#x1F6D2;</span>
            <span class="node-tooltip__feature-text">Unlocks Market</span>
          </div>

          <!-- HQ Income -->
          <div v-if="node.type === NodeType.CAPITAL" class="node-tooltip__feature node-tooltip__feature--income">
            <span class="node-tooltip__feature-icon">&#x1F4B0;</span>
            <span class="node-tooltip__feature-text">+20 Credits/tick</span>
          </div>
        </template>
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

.node-tooltip__claim-cost {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgb(20, 45, 30);
  border-top: 1px solid rgba(34, 197, 94, 0.3);
}

.node-tooltip__claim-cost-label {
  font-size: 0.6875rem;
  color: #86efac;
}

.node-tooltip__claim-cost-value {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #4ade80;
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
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.node-tooltip__bonuses:last-child {
  border-radius: 0 0 0.5rem 0.5rem;
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

/* Node Resources */
.node-tooltip__resources {
  padding: 0.5rem 0.75rem;
  background: rgba(15, 23, 42, 0.95);
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.node-tooltip__resources-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.375rem;
}

.node-tooltip__resources-icon {
  font-size: 0.75rem;
}

.node-tooltip__resources-label {
  font-size: 0.625rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.node-tooltip__resources-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.node-tooltip__resource {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.375rem;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 0.25rem;
}

.node-tooltip__resource-icon {
  font-size: 0.75rem;
}

.node-tooltip__resource-amount {
  font-size: 0.75rem;
  font-weight: 500;
  color: #e2e8f0;
  font-variant-numeric: tabular-nums;
}

/* Feature note (e.g., Trade Hub unlocks Market) */
.node-tooltip__feature {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgb(45, 35, 15);
  border-top: 1px solid rgba(218, 165, 32, 0.4);
  border-radius: 0 0 0.5rem 0.5rem;
}

.node-tooltip__feature-icon {
  font-size: 1rem;
}

.node-tooltip__feature-text {
  font-size: 0.75rem;
  font-weight: 600;
  color: #fcd34d;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Income feature variant (HQ) */
.node-tooltip__feature--income {
  background: rgb(15, 45, 25);
  border-top: 1px solid rgba(34, 197, 94, 0.4);
}

.node-tooltip__feature--income .node-tooltip__feature-text {
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

/* ==================== CROWN TOOLTIP STYLES ==================== */

.node-tooltip--crown {
  min-width: 260px;
}

.node-tooltip--crown.node-tooltip--visible {
  box-shadow:
    0 0 20px rgba(255, 215, 0, 0.3),
    0 4px 6px -1px rgba(0, 0, 0, 0.3),
    0 2px 4px -1px rgba(0, 0, 0, 0.2),
    0 0 0 2px rgba(255, 215, 0, 0.5);
}

.crown-tooltip__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem;
  background: linear-gradient(135deg, rgba(120, 90, 20, 0.95), rgba(80, 60, 10, 0.98));
  border-radius: 0.5rem 0.5rem 0 0;
  border-bottom: 2px solid rgba(255, 215, 0, 0.5);
}

.crown-tooltip__icon {
  font-size: 2rem;
  line-height: 1;
  filter: drop-shadow(0 0 4px rgba(255, 215, 0, 0.6));
}

.crown-tooltip__title {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.crown-tooltip__name {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #ffd700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  letter-spacing: 0.025em;
}

.crown-tooltip__subtitle {
  font-size: 0.6875rem;
  color: #fbbf24;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 600;
}

.crown-tooltip__description {
  padding: 0.75rem;
  background: rgba(45, 35, 10, 0.95);
  border-bottom: 1px solid rgba(255, 215, 0, 0.2);
}

.crown-tooltip__description p {
  margin: 0;
  font-size: 0.8125rem;
  color: #f5f5dc;
  line-height: 1.4;
}

.crown-tooltip__description p strong {
  color: #ffd700;
  font-weight: 700;
}

.crown-tooltip__flavor {
  margin-top: 0.375rem !important;
  font-size: 0.75rem !important;
  color: #d4a84b !important;
  font-style: italic;
}

.crown-tooltip__status {
  display: flex;
  padding: 0.5rem 0.75rem;
  background: rgba(35, 28, 8, 0.95);
  border-bottom: 1px solid rgba(255, 215, 0, 0.2);
}

.crown-tooltip__stat {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.crown-tooltip__stat-label {
  font-size: 0.625rem;
  color: #a78b4a;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.crown-tooltip__stat-value {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #f5e6c8;
}

.crown-tooltip__holder {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.625rem 0.75rem;
  background: rgb(55, 35, 15);
}

.crown-tooltip__holder-icon {
  font-size: 1.25rem;
}

.crown-tooltip__holder-info {
  display: flex;
  flex-direction: column;
  gap: 0.0625rem;
}

.crown-tooltip__holder-label {
  font-size: 0.625rem;
  color: #a78b4a;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.crown-tooltip__holder-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: #ffd700;
}

.crown-tooltip__unclaimed {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  background: linear-gradient(135deg, rgba(50, 40, 15, 0.95), rgba(35, 28, 8, 0.98));
  border-radius: 0 0 0.5rem 0.5rem;
}

.crown-tooltip__unclaimed-icon {
  font-size: 1rem;
}

.crown-tooltip__unclaimed-text {
  font-size: 0.75rem;
  color: #d4a84b;
  font-style: italic;
}

/* Crown Countdown Styles */
.crown-tooltip__countdown {
  padding: 0.625rem 0.75rem;
  background: linear-gradient(135deg, rgba(40, 32, 10, 0.98), rgba(30, 24, 8, 0.98));
  border-top: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 0 0 0.5rem 0.5rem;
}

.crown-tooltip__countdown-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.crown-tooltip__countdown-icon {
  font-size: 1rem;
}

.crown-tooltip__countdown-label {
  font-size: 0.6875rem;
  color: #a78b4a;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.crown-tooltip__countdown-time {
  margin-left: auto;
  font-size: 1rem;
  font-weight: 700;
  color: #ffd700;
  font-family: monospace;
  text-shadow: 0 0 8px rgba(255, 215, 0, 0.5);
}

.crown-tooltip__progress-bar {
  height: 6px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 0.375rem;
}

.crown-tooltip__progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #ffd700, #ffec4d);
  border-radius: 3px;
  transition: width 0.3s ease-out;
  box-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
}

.crown-tooltip__progress-text {
  font-size: 0.625rem;
  color: #d4a84b;
  text-align: center;
}
</style>
