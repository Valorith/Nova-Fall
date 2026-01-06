<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { GameEngine, ZOOM_LEVELS, type ZoomLevel } from '../game';

const gameContainer = ref<HTMLDivElement | null>(null);
const engine = ref<GameEngine | null>(null);
const currentZoomLevel = ref<ZoomLevel>('strategic');
const showControls = ref(true);

onMounted(() => {
  if (!gameContainer.value) return;

  // Initialize the game engine
  engine.value = new GameEngine({
    container: gameContainer.value,
    backgroundColor: 0x0a0a0f,
  });

  // Listen for zoom level changes
  engine.value.onZoomLevelChange = (level) => {
    currentZoomLevel.value = level;
  };
});

onUnmounted(() => {
  if (engine.value) {
    engine.value.destroy();
    engine.value = null;
  }
});

function handleZoomIn() {
  engine.value?.zoomIn();
}

function handleZoomOut() {
  engine.value?.zoomOut();
}

function handleResetView() {
  engine.value?.panTo(1000, 1000, true);
  engine.value?.setZoomLevel('strategic');
}

function getZoomLevelLabel(level: ZoomLevel): string {
  return ZOOM_LEVELS.find((z) => z.level === level)?.label ?? level;
}
</script>

<template>
  <div class="relative h-screen w-screen overflow-hidden bg-gray-950">
    <!-- Game Canvas Container -->
    <div ref="gameContainer" class="absolute inset-0" />

    <!-- UI Overlay -->
    <div class="pointer-events-none absolute inset-0">
      <!-- Top Bar -->
      <div class="pointer-events-auto flex items-center justify-between bg-gray-900/80 px-4 py-2 backdrop-blur-sm">
        <div class="flex items-center gap-4">
          <h1 class="text-lg font-bold text-white">Nova Fall</h1>
          <span class="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300">
            {{ getZoomLevelLabel(currentZoomLevel) }}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button
            class="rounded bg-gray-800 px-3 py-1 text-sm text-gray-300 hover:bg-gray-700"
            @click="showControls = !showControls"
          >
            {{ showControls ? 'Hide Controls' : 'Show Controls' }}
          </button>
        </div>
      </div>

      <!-- Zoom Controls (bottom right) -->
      <div
        v-if="showControls"
        class="pointer-events-auto absolute bottom-4 right-4 flex flex-col gap-2"
      >
        <button
          class="flex h-10 w-10 items-center justify-center rounded bg-gray-800/90 text-white hover:bg-gray-700"
          title="Zoom In"
          @click="handleZoomIn"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          class="flex h-10 w-10 items-center justify-center rounded bg-gray-800/90 text-white hover:bg-gray-700"
          title="Zoom Out"
          @click="handleZoomOut"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
          </svg>
        </button>
        <button
          class="flex h-10 w-10 items-center justify-center rounded bg-gray-800/90 text-white hover:bg-gray-700"
          title="Reset View"
          @click="handleResetView"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <!-- Instructions (bottom left) -->
      <div
        v-if="showControls"
        class="pointer-events-auto absolute bottom-4 left-4 rounded bg-gray-900/80 px-4 py-3 text-sm backdrop-blur-sm"
      >
        <p class="mb-1 font-medium text-gray-200">Controls:</p>
        <ul class="space-y-1 text-gray-400">
          <li>Drag to pan</li>
          <li>Scroll to zoom</li>
          <li>Click node to select</li>
        </ul>
      </div>
    </div>
  </div>
</template>
