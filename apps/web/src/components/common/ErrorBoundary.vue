<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  fallbackMessage?: string;
}

const props = withDefaults(defineProps<Props>(), {
  fallbackMessage: 'Something went wrong. Please try again.',
});

const error = ref<Error | null>(null);

function handleError(err: Error) {
  error.value = err;
  console.error('ErrorBoundary caught:', err);
}

function retry() {
  error.value = null;
}

defineExpose({ handleError });
</script>

<template>
  <div v-if="error" class="flex min-h-[200px] flex-col items-center justify-center text-center">
    <div class="mb-4 text-red-500">
      <svg class="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    </div>
    <p class="mb-4 text-gray-400">{{ props.fallbackMessage }}</p>
    <button
      class="rounded bg-orange-600 px-4 py-2 text-white transition-colors hover:bg-orange-500"
      @click="retry"
    >
      Try Again
    </button>
  </div>
  <slot v-else />
</template>
