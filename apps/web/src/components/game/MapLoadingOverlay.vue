<script setup lang="ts">
defineProps<{
  visible: boolean;
  progress: number;
  stage: string;
}>();
</script>

<template>
  <Transition name="fade">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/95 backdrop-blur-sm"
    >
      <div class="bg-gray-900/90 rounded-2xl p-8 shadow-2xl border border-gray-700/50 w-[400px]">
        <!-- Title with subtle glow -->
        <div class="text-center mb-8">
          <h2 class="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
            Nova Fall
          </h2>
          <p class="text-gray-500 text-sm mt-1">Loading tactical map...</p>
        </div>

        <!-- Progress Bar Container -->
        <div class="relative mb-4">
          <!-- Background track -->
          <div class="h-3 bg-gray-800 rounded-full overflow-hidden">
            <!-- Progress fill with gradient -->
            <div
              class="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 transition-all duration-300 ease-out relative"
              :style="{ width: `${progress}%` }"
            >
              <!-- Animated shine effect -->
              <div
                class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
              />
            </div>
          </div>

          <!-- Glow under the bar -->
          <div
            class="absolute -bottom-2 left-0 h-4 bg-gradient-to-r from-indigo-500/30 via-purple-500/30 to-indigo-500/30 blur-md transition-all duration-300"
            :style="{ width: `${progress}%` }"
          />
        </div>

        <!-- Stage + Percentage -->
        <div class="flex justify-between items-center text-sm">
          <span class="text-gray-400 truncate max-w-[70%]">{{ stage }}</span>
          <span class="text-indigo-300 font-semibold tabular-nums">{{ progress }}%</span>
        </div>

        <!-- Loading dots animation -->
        <div class="flex justify-center gap-1.5 mt-6">
          <div class="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style="animation-delay: 0ms" />
          <div class="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style="animation-delay: 150ms" />
          <div class="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style="animation-delay: 300ms" />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.animate-shimmer {
  animation: shimmer 2s infinite;
}
</style>
