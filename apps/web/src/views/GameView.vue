<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const gameContainer = ref<HTMLDivElement | null>(null);

onMounted(() => {
  // PixiJS game engine will be initialized here
  console.log('Game view mounted, container:', gameContainer.value);
});

onUnmounted(() => {
  // Cleanup game engine
  console.log('Game view unmounted');
});
</script>

<template>
  <div class="relative h-screen w-screen bg-gray-950">
    <div ref="gameContainer" class="absolute inset-0" />

    <!-- Placeholder UI overlay -->
    <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div class="text-center">
        <h2 class="text-2xl font-bold text-gray-400">Game Canvas</h2>
        <p class="text-gray-500">PixiJS will render here</p>
      </div>
    </div>
  </div>
</template>
