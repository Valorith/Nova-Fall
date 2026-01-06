<script setup lang="ts">
import { useToastStore, type ToastType } from '@/stores/toast';

const toastStore = useToastStore();

function getToastClasses(type: ToastType): string {
  const baseClasses = 'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg backdrop-blur-sm border';

  switch (type) {
    case 'success':
      return `${baseClasses} bg-green-900/90 border-green-700 text-green-100`;
    case 'error':
      return `${baseClasses} bg-red-900/90 border-red-700 text-red-100`;
    case 'warning':
      return `${baseClasses} bg-yellow-900/90 border-yellow-700 text-yellow-100`;
    case 'info':
    default:
      return `${baseClasses} bg-blue-900/90 border-blue-700 text-blue-100`;
  }
}

function getIcon(type: ToastType): string {
  switch (type) {
    case 'success':
      return 'M5 13l4 4L19 7'; // Checkmark
    case 'error':
      return 'M6 18L18 6M6 6l12 12'; // X
    case 'warning':
      return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'; // Triangle warning
    case 'info':
    default:
      return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'; // Info circle
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toastStore.toasts"
          :key="toast.id"
          :class="getToastClasses(toast.type)"
          class="pointer-events-auto min-w-[280px] max-w-[400px]"
        >
          <!-- Icon -->
          <svg
            class="h-5 w-5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              :d="getIcon(toast.type)"
            />
          </svg>

          <!-- Message -->
          <span class="flex-1 text-sm font-medium">{{ toast.message }}</span>

          <!-- Close button -->
          <button
            class="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            @click="toastStore.remove(toast.id)"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active {
  transition: all 0.3s ease-out;
}

.toast-leave-active {
  transition: all 0.2s ease-in;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.toast-move {
  transition: transform 0.3s ease;
}
</style>
