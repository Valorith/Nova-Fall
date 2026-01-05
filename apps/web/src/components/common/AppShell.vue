<script setup lang="ts">
import LoadingSpinner from './LoadingSpinner.vue';
</script>

<template>
  <div class="min-h-screen bg-gray-900">
    <Suspense>
      <template #default>
        <slot />
      </template>
      <template #fallback>
        <div class="flex min-h-screen items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </template>
    </Suspense>
  </div>
</template>
