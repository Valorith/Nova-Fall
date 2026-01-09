<script setup lang="ts">
import { computed } from 'vue';

interface VictoryInfo {
  winnerId: string;
  winnerName: string;
  gameType: 'KING_OF_THE_HILL' | 'DOMINATION';
  reason: string;
}

const props = defineProps<{
  victory: VictoryInfo | null;
  currentPlayerId: string | null;
}>();

const emit = defineEmits<{
  close: [];
  returnToLobby: [];
}>();

const isWinner = computed(() => {
  return props.victory?.winnerId === props.currentPlayerId;
});

const gameTypeName = computed(() => {
  if (!props.victory) return '';
  return props.victory.gameType === 'KING_OF_THE_HILL' ? 'King of the Hill' : 'Domination';
});

const handleReturnToLobby = () => {
  emit('returnToLobby');
};
</script>

<template>
  <Teleport to="body">
    <div v-if="victory" class="fixed inset-0 z-50 flex items-center justify-center">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="emit('close')"></div>

      <!-- Modal -->
      <div class="relative z-10 bg-slate-800 rounded-lg shadow-2xl border border-slate-600 p-8 max-w-md w-full mx-4 text-center">
        <!-- Victory/Defeat Banner -->
        <div
          class="text-4xl font-bold mb-4"
          :class="isWinner ? 'text-yellow-400' : 'text-red-400'"
        >
          {{ isWinner ? 'VICTORY!' : 'DEFEAT' }}
        </div>

        <!-- Crown/Skull Icon -->
        <div class="text-6xl mb-4">
          {{ isWinner ? '&#x1F451;' : '&#x1F480;' }}
        </div>

        <!-- Winner Name -->
        <div class="text-xl text-slate-300 mb-2">
          <span class="text-amber-400 font-semibold">{{ victory.winnerName }}</span>
          <span class="text-slate-400"> wins!</span>
        </div>

        <!-- Game Type -->
        <div class="text-sm text-slate-500 mb-4">
          {{ gameTypeName }}
        </div>

        <!-- Reason -->
        <div class="bg-slate-700/50 rounded-lg px-4 py-3 mb-6">
          <div class="text-slate-400 text-sm">{{ victory.reason }}</div>
        </div>

        <!-- Action Button -->
        <button
          @click="handleReturnToLobby"
          class="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors"
        >
          Return to Lobby
        </button>
      </div>
    </div>
  </Teleport>
</template>
