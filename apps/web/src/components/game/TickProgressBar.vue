<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';

const props = defineProps<{
  nextTickAt: number; // timestamp
  tickInterval: number; // milliseconds
}>();

const now = ref(Date.now());
let animationFrame: number | null = null;
const showTooltip = ref(false);

// Calculate progress (0 to 1)
const progress = computed(() => {
  if (!props.nextTickAt || !props.tickInterval) return 0;

  const remaining = props.nextTickAt - now.value;
  const elapsed = props.tickInterval - remaining;
  const p = Math.max(0, Math.min(1, elapsed / props.tickInterval));
  return p;
});

// Remaining time in milliseconds
const remainingMs = computed(() => {
  if (!props.nextTickAt) return 0;
  return Math.max(0, props.nextTickAt - now.value);
});

// Format remaining time as MM:SS or just SS depending on duration
const formattedTime = computed(() => {
  const totalSeconds = Math.ceil(remainingMs.value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${seconds}s`;
});

// Is the tick about to happen (last 60 seconds for hourly, last 3 for short)?
const isImminent = computed(() => {
  const seconds = Math.ceil(remainingMs.value / 1000);
  // For hourly intervals, warn in last minute; for shorter, last 3 seconds
  const threshold = props.tickInterval >= 60000 ? 60 : 3;
  return seconds <= threshold && seconds > 0;
});

// Is the timer expired and waiting for the next tick event?
const isProcessing = computed(() => {
  return remainingMs.value <= 0;
});

// Smooth animation loop
function updateTime() {
  now.value = Date.now();
  animationFrame = requestAnimationFrame(updateTime);
}

onMounted(() => {
  updateTime();
});

onUnmounted(() => {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
  }
});

// Flash effect when tick happens
const justTicked = ref(false);
watch(() => props.nextTickAt, () => {
  justTicked.value = true;
  setTimeout(() => {
    justTicked.value = false;
  }, 300);
});
</script>

<template>
  <div
    class="relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/50 cursor-help"
    :class="{
      'border-green-500/50 bg-green-900/20': justTicked || isProcessing,
      'border-amber-500/50': isImminent && !isProcessing
    }"
    @mouseenter="showTooltip = true"
    @mouseleave="showTooltip = false"
  >
    <!-- Background glow effect -->
    <div
      class="absolute inset-0 transition-opacity duration-300"
      :class="justTicked ? 'opacity-100' : 'opacity-0'"
      style="background: radial-gradient(ellipse at center, rgba(34, 197, 94, 0.2) 0%, transparent 70%)"
    />

    <!-- Icon -->
    <div class="relative z-10 flex-shrink-0">
      <svg
        class="w-4 h-4 transition-colors duration-200"
        :class="[
          isProcessing ? 'text-green-400 animate-spin' : isImminent ? 'text-amber-400' : 'text-gray-400'
        ]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </div>

    <!-- Progress bar container -->
    <div class="relative z-10 flex-1 h-2 bg-gray-700/50 rounded-full overflow-hidden min-w-[60px]">
      <!-- Progress fill with gradient -->
      <div
        class="h-full rounded-full transition-all duration-100 ease-linear"
        :class="[
          isProcessing
            ? 'bg-gradient-to-r from-green-600 to-green-400 animate-pulse'
            : isImminent
              ? 'bg-gradient-to-r from-amber-500 to-amber-400'
              : 'bg-gradient-to-r from-cyan-600 to-cyan-400'
        ]"
        :style="{ width: isProcessing ? '100%' : `${progress * 100}%` }"
      />

      <!-- Shimmer effect -->
      <div
        class="absolute inset-0 overflow-hidden rounded-full"
        :style="{ clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }"
      >
        <div
          class="absolute inset-0 -translate-x-full animate-shimmer"
          style="background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)"
        />
      </div>
    </div>

    <!-- Time display -->
    <div
      class="relative z-10 flex-shrink-0 text-xs font-mono font-medium min-w-[40px] text-right transition-colors duration-200"
      :class="[
        isProcessing ? 'text-green-400 animate-pulse' : isImminent ? 'text-amber-400' : 'text-gray-400'
      ]"
      :style="{ minWidth: isProcessing ? '80px' : '40px' }"
    >
      {{ isProcessing ? 'Processing...' : formattedTime }}
    </div>

    <!-- Tooltip -->
    <div
      v-if="showTooltip"
      class="absolute top-full left-0 mt-1 z-50 w-64 p-3 rounded-lg bg-gray-900 border border-gray-700 shadow-xl text-xs"
    >
      <div class="font-semibold text-gray-200 mb-1">Economy Tick</div>
      <p class="text-gray-400 leading-relaxed">
        Time until the next hourly economy update. When this timer reaches zero:
      </p>
      <ul class="mt-2 space-y-1 text-gray-400">
        <li class="flex items-start gap-1.5">
          <span class="text-green-400 mt-0.5">+</span>
          <span>Income is collected from your nodes</span>
        </li>
        <li class="flex items-start gap-1.5">
          <span class="text-red-400 mt-0.5">-</span>
          <span>Upkeep costs are deducted</span>
        </li>
        <li class="flex items-start gap-1.5">
          <span class="text-cyan-400 mt-0.5">+</span>
          <span>Resources are generated</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(200%);
  }
}

.animate-shimmer {
  animation: shimmer 2s infinite;
}
</style>
