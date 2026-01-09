<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';

const props = withDefaults(defineProps<{
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}>(), {
  position: 'top',
  delay: 0,
});

const triggerRef = ref<HTMLElement | null>(null);
const isVisible = ref(false);
const tooltipPosition = ref({ x: 0, y: 0 });
let showTimeout: ReturnType<typeof setTimeout> | null = null;

function calculatePosition() {
  if (!triggerRef.value) return;

  const rect = triggerRef.value.getBoundingClientRect();
  const padding = 8;

  switch (props.position) {
    case 'top':
      tooltipPosition.value = {
        x: rect.left + rect.width / 2,
        y: rect.top - padding,
      };
      break;
    case 'bottom':
      tooltipPosition.value = {
        x: rect.left + rect.width / 2,
        y: rect.bottom + padding,
      };
      break;
    case 'left':
      tooltipPosition.value = {
        x: rect.left - padding,
        y: rect.top + rect.height / 2,
      };
      break;
    case 'right':
      tooltipPosition.value = {
        x: rect.right + padding,
        y: rect.top + rect.height / 2,
      };
      break;
  }
}

function handleMouseEnter() {
  if (props.delay > 0) {
    showTimeout = setTimeout(() => {
      calculatePosition();
      isVisible.value = true;
    }, props.delay);
  } else {
    calculatePosition();
    isVisible.value = true;
  }
}

function handleMouseLeave() {
  if (showTimeout) {
    clearTimeout(showTimeout);
    showTimeout = null;
  }
  isVisible.value = false;
}

onUnmounted(() => {
  if (showTimeout) {
    clearTimeout(showTimeout);
  }
});

const tooltipStyle = computed(() => {
  const base: Record<string, string> = {
    position: 'fixed',
    zIndex: '9999',
  };

  switch (props.position) {
    case 'top':
      return {
        ...base,
        left: `${tooltipPosition.value.x}px`,
        top: `${tooltipPosition.value.y}px`,
        transform: 'translateX(-50%) translateY(-100%)',
      };
    case 'bottom':
      return {
        ...base,
        left: `${tooltipPosition.value.x}px`,
        top: `${tooltipPosition.value.y}px`,
        transform: 'translateX(-50%)',
      };
    case 'left':
      return {
        ...base,
        left: `${tooltipPosition.value.x}px`,
        top: `${tooltipPosition.value.y}px`,
        transform: 'translateX(-100%) translateY(-50%)',
      };
    case 'right':
    default:
      return {
        ...base,
        left: `${tooltipPosition.value.x}px`,
        top: `${tooltipPosition.value.y}px`,
        transform: 'translateY(-50%)',
      };
  }
});
</script>

<template>
  <div
    ref="triggerRef"
    class="inline-block"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <slot />

    <Teleport to="body">
      <Transition name="tooltip">
        <div
          v-if="isVisible && text"
          class="tooltip-content"
          :style="tooltipStyle"
        >
          {{ text }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.tooltip-content {
  padding: 0.5rem 0.75rem;
  background: rgba(0, 0, 0, 0.95);
  color: #e5e7eb;
  font-size: 0.75rem;
  line-height: 1.4;
  border-radius: 0.375rem;
  white-space: nowrap;
  pointer-events: none;
  border: 1px solid rgba(75, 85, 99, 0.5);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  max-width: 300px;
  white-space: normal;
  word-wrap: break-word;
}

.tooltip-enter-active {
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}

.tooltip-leave-active {
  transition: opacity 0.1s ease-in, transform 0.1s ease-in;
}

.tooltip-enter-from,
.tooltip-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-100%) scale(0.95);
}
</style>
