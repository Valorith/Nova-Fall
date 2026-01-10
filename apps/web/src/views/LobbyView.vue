<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useSessionStore, type GameType, type SessionListItem, type SessionPlayer } from '@/stores/session';
import { gameApi } from '@/services/api';
import lobbyBackground from '@/assets/lobby-background.jpg';

const router = useRouter();
const authStore = useAuthStore();
const sessionStore = useSessionStore();

const showCreateModal = ref(false);
const newSessionName = ref('');
const newSessionType = ref<GameType>('KING_OF_THE_HILL');

// Economy tick timing
const nextUpkeepAt = ref(0);
const upkeepInterval = ref(3600000);
const currentTime = ref(Date.now()); // Reactive time for countdown display
let tickUpdateInterval: ReturnType<typeof setInterval> | null = null;

const activeSession = computed(() => authStore.user?.activeSession);
const isCreator = computed(() => activeSession.value?.isCreator ?? false);
const canStart = computed(() => {
  if (!sessionStore.currentSession) return false;
  const playerCount = sessionStore.currentSession.players.filter(p => p.role === 'PLAYER').length;
  return isCreator.value &&
         sessionStore.currentSession.status === 'LOBBY' &&
         playerCount >= sessionStore.currentSession.minPlayers;
});

// Get filled player slots and empty slots for current session
const playerSlots = computed(() => {
  if (!sessionStore.currentSession) return [];
  const players = sessionStore.currentSession.players.filter(p => p.role === 'PLAYER');
  const maxPlayers = sessionStore.currentSession.maxPlayers;
  const slots: (SessionPlayer | null)[] = [...players];
  // Fill remaining slots with nulls
  while (slots.length < maxPlayers) {
    slots.push(null);
  }
  return slots;
});

const canAddBot = computed(() => {
  if (!sessionStore.currentSession || !isCreator.value) return false;
  const playerCount = sessionStore.currentSession.players.filter(p => p.role === 'PLAYER').length;
  return sessionStore.currentSession.status === 'LOBBY' &&
         playerCount < sessionStore.currentSession.maxPlayers;
});

// Load economy tick timing
async function loadEconomyTick() {
  try {
    const response = await gameApi.getStatus();
    nextUpkeepAt.value = response.data.nextUpkeepAt;
    upkeepInterval.value = response.data.upkeepInterval;
  } catch (err) {
    console.error('Failed to load economy tick:', err);
  }
}

// Computed for next tick display (uses reactive currentTime)
const nextTickDisplay = computed(() => {
  const diff = nextUpkeepAt.value - currentTime.value;

  if (diff <= 0) return 'Now';

  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
});

onMounted(async () => {
  await Promise.all([
    sessionStore.fetchSessions(),
    loadEconomyTick(),
  ]);

  // Update the tick display every second
  tickUpdateInterval = setInterval(() => {
    currentTime.value = Date.now();
    // Tick has passed, reload the timing
    if (nextUpkeepAt.value > 0 && currentTime.value >= nextUpkeepAt.value) {
      loadEconomyTick();
    }
  }, 1000);

  // If user has an active session, fetch its details
  if (activeSession.value) {
    await sessionStore.fetchSessionById(activeSession.value.id);
  }
});

onUnmounted(() => {
  if (tickUpdateInterval) {
    clearInterval(tickUpdateInterval);
    tickUpdateInterval = null;
  }
});

async function handleCreateSession() {
  if (!newSessionName.value.trim()) return;

  try {
    const session = await sessionStore.createSession(newSessionName.value.trim(), newSessionType.value);
    showCreateModal.value = false;
    newSessionName.value = '';
    // Refresh to show the new session
    await sessionStore.fetchSessionById(session.id);
  } catch {
    // Error is handled by the store
  }
}

async function handleJoinSession(session: SessionListItem) {
  try {
    await sessionStore.joinSession(session.id);
    await sessionStore.fetchSessionById(session.id);
  } catch {
    // Error is handled by the store
  }
}

async function handleLeaveSession() {
  if (!activeSession.value) return;
  try {
    await sessionStore.leaveSession(activeSession.value.id);
    sessionStore.currentSession = null;
  } catch {
    // Error is handled by the store
  }
}

async function handleStartSession() {
  if (!activeSession.value) return;
  try {
    await sessionStore.startSession(activeSession.value.id);
  } catch {
    // Error is handled by the store
  }
}

async function handleAddBot() {
  if (!activeSession.value) return;
  try {
    await sessionStore.addBot(activeSession.value.id);
  } catch {
    // Error is handled by the store
  }
}

async function handleRemoveBot(botId: string) {
  if (!activeSession.value) return;
  try {
    await sessionStore.removeBot(activeSession.value.id, botId);
  } catch {
    // Error is handled by the store
  }
}

function handleContinue() {
  if (!activeSession.value) return;
  router.push(`/game/${activeSession.value.id}`);
}

async function handleEndSession() {
  if (!activeSession.value) return;
  if (!confirm('Are you sure you want to end this game? All progress will be lost.')) {
    return;
  }
  try {
    await sessionStore.endSession(activeSession.value.id);
  } catch {
    // Error is handled by the store
  }
}

function formatGameType(type: GameType): string {
  return type === 'KING_OF_THE_HILL' ? 'KOTH' : 'DOM';
}

function getPlayerCount(session: SessionListItem): string {
  return `${session.playerCount}/${session.maxPlayers} slots`;
}

function getPlayerBreakdown(session: SessionListItem): string {
  if (session.botCount === 0) return '';
  return `(${session.humanCount} human, ${session.botCount} bot)`;
}

async function handleLogout() {
  await authStore.logout();
  router.push('/login');
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white relative">
    <!-- Background Image -->
    <div
      class="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-60"
      :style="{ backgroundImage: `url(${lobbyBackground})` }"
    ></div>
    <div class="relative z-10">
    <!-- Header -->
    <header class="border-b border-gray-800 bg-gray-900/95 px-6 py-4">
      <div class="relative flex items-center justify-between">
        <h1 class="text-2xl font-bold text-indigo-400">NOVA FALL</h1>
        <span v-if="nextUpkeepAt > 0" class="absolute left-1/2 -translate-x-1/2 text-sm text-gray-400">
          Next economy tick in <span class="text-amber-400 font-medium">{{ nextTickDisplay }}</span>
        </span>
        <div class="flex items-center gap-4">
          <router-link
            to="/dev"
            class="rounded bg-orange-600/20 border border-orange-500/50 px-3 py-1.5 text-sm text-orange-400 hover:bg-orange-600/30"
          >
            Dev Panel
          </router-link>
          <span class="text-gray-400">{{ authStore.user?.username }}</span>
          <button
            class="rounded bg-gray-700 px-3 py-1.5 text-sm hover:bg-gray-600"
            @click="handleLogout"
          >
            Logout
          </button>
        </div>
      </div>
    </header>

    <main class="container mx-auto max-w-4xl px-4 py-8">
      <!-- Error Message -->
      <div v-if="sessionStore.error" class="mb-6 rounded-lg bg-red-900/50 border border-red-700 p-4">
        <p class="text-red-300">{{ sessionStore.error }}</p>
        <button
          class="mt-2 text-sm text-red-400 hover:text-red-300"
          @click="sessionStore.clearError()"
        >
          Dismiss
        </button>
      </div>

      <!-- Your Active Game Section -->
      <section v-if="activeSession" class="mb-8">
        <h2 class="mb-4 text-lg font-semibold text-gray-300">YOUR ACTIVE GAME</h2>
        <div class="rounded-lg border border-gray-700 bg-gray-800 p-6">
          <div class="flex items-start justify-between">
            <div>
              <h3 class="text-xl font-bold">{{ activeSession.name }}</h3>
              <div class="mt-1 flex items-center gap-3 text-sm text-gray-400">
                <span class="rounded bg-indigo-900/50 px-2 py-0.5 text-indigo-300">
                  {{ formatGameType(activeSession.gameType) }}
                </span>
                <span v-if="activeSession.status === 'LOBBY'" class="text-yellow-400">
                  Waiting for players...
                </span>
                <span v-else-if="activeSession.status === 'ACTIVE'" class="text-green-400">
                  Game in progress
                </span>
                <span
                  v-if="sessionStore.currentSession"
                  :class="sessionStore.currentSession.activeViewers > 0 ? 'text-green-400' : 'text-gray-500'"
                  title="Players viewing the game board"
                >
                  {{ sessionStore.currentSession.activeViewers }} Active {{ sessionStore.currentSession.activeViewers === 1 ? 'Player' : 'Players' }}
                </span>
              </div>

              <!-- Session details when in LOBBY -->
              <div v-if="sessionStore.currentSession && activeSession.status === 'LOBBY'" class="mt-3">
                <p class="text-sm text-gray-400">
                  {{ sessionStore.currentSession.players.filter(p => p.role === 'PLAYER').length }} /
                  {{ sessionStore.currentSession.maxPlayers }} slots filled
                  <span class="text-gray-500">(min {{ sessionStore.currentSession.minPlayers }} to start)</span>
                </p>

                <!-- Player Slots Grid -->
                <div class="mt-3 grid grid-cols-4 gap-2">
                  <template v-for="(slot, index) in playerSlots" :key="index">
                    <!-- Filled slot - Player or Bot -->
                    <div
                      v-if="slot"
                      class="flex items-center justify-between rounded border px-3 py-2 text-sm"
                      :class="{
                        'border-indigo-500 bg-indigo-900/30': slot.isCreator,
                        'border-cyan-600 bg-cyan-900/20': slot.isBot,
                        'border-gray-600 bg-gray-700': !slot.isCreator && !slot.isBot
                      }"
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <span v-if="slot.isBot" class="text-cyan-400 flex-shrink-0">🤖</span>
                        <span class="truncate">{{ slot.displayName }}</span>
                        <span v-if="slot.isCreator" class="text-xs text-indigo-400 flex-shrink-0">(host)</span>
                      </div>
                      <!-- Remove bot button (only for host and bots) -->
                      <button
                        v-if="isCreator && slot.isBot"
                        title="Remove bot"
                        class="ml-2 text-gray-400 hover:text-red-400 flex-shrink-0"
                        :disabled="sessionStore.isLoading"
                        @click="handleRemoveBot(slot.id)"
                      >
                        ✕
                      </button>
                    </div>

                    <!-- Empty slot -->
                    <div
                      v-else
                      class="rounded border border-dashed border-gray-600 bg-gray-800/50 px-3 py-2 text-sm text-gray-500 flex items-center justify-center"
                    >
                      <template v-if="isCreator && canAddBot">
                        <button
                          class="text-gray-400 hover:text-indigo-400"
                          :disabled="sessionStore.isLoading"
                          @click="handleAddBot"
                        >
                          + Add Bot
                        </button>
                      </template>
                      <template v-else>
                        Empty
                      </template>
                    </div>
                  </template>
                </div>
              </div>
            </div>

            <div class="flex gap-3">
              <template v-if="activeSession.status === 'LOBBY'">
                <button
                  v-if="canStart"
                  :disabled="sessionStore.isLoading"
                  class="rounded bg-green-600 px-4 py-2 font-medium hover:bg-green-500 disabled:opacity-50"
                  @click="handleStartSession"
                >
                  Start Game
                </button>
                <button
                  :disabled="sessionStore.isLoading"
                  class="rounded bg-gray-600 px-4 py-2 hover:bg-gray-500 disabled:opacity-50"
                  @click="handleLeaveSession"
                >
                  Leave
                </button>
              </template>
              <template v-else-if="activeSession.status === 'ACTIVE'">
                <button
                  class="rounded bg-indigo-600 px-6 py-2 font-medium hover:bg-indigo-500"
                  @click="handleContinue"
                >
                  Enter Game
                </button>
                <button
                  v-if="isCreator"
                  :disabled="sessionStore.isLoading"
                  class="rounded bg-red-600 px-4 py-2 font-medium hover:bg-red-500 disabled:opacity-50"
                  @click="handleEndSession"
                >
                  End Game
                </button>
              </template>
            </div>
          </div>
        </div>
      </section>

      <!-- Available Games Section -->
      <section>
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-300">AVAILABLE GAMES</h2>
          <button
            v-if="!activeSession"
            class="rounded bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500"
            @click="showCreateModal = true"
          >
            + Create New Game
          </button>
        </div>

        <div v-if="sessionStore.isLoading && !sessionStore.availableSessions.length" class="text-center py-8">
          <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
          <p class="mt-2 text-gray-400">Loading sessions...</p>
        </div>

        <div v-else-if="sessionStore.availableSessions.length === 0" class="rounded-lg border border-gray-700 bg-gray-800/50 p-8 text-center">
          <p class="text-gray-400">No games available to join.</p>
          <p class="mt-1 text-sm text-gray-500">Create a new game to get started!</p>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="session in sessionStore.availableSessions"
            :key="session.id"
            class="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800 p-4"
          >
            <div>
              <h3 class="font-semibold">{{ session.name }}</h3>
              <div class="mt-1 flex items-center gap-3 text-sm text-gray-400">
                <span class="rounded bg-indigo-900/50 px-2 py-0.5 text-indigo-300">
                  {{ formatGameType(session.gameType) }}
                </span>
                <span>{{ getPlayerCount(session) }}</span>
                <span v-if="getPlayerBreakdown(session)" class="text-gray-500">{{ getPlayerBreakdown(session) }}</span>
                <span :class="session.activeViewers > 0 ? 'text-green-400' : 'text-gray-500'" title="Players viewing the game board">
                  {{ session.activeViewers }} Active {{ session.activeViewers === 1 ? 'Player' : 'Players' }}
                </span>
                <span class="text-gray-500">by {{ session.creatorName }}</span>
              </div>
            </div>
            <div class="flex gap-2">
              <button
                v-if="!activeSession"
                :disabled="sessionStore.isLoading"
                class="rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
                @click="handleJoinSession(session)"
              >
                Join
              </button>
              <button
                :disabled="true"
                class="rounded bg-gray-700 px-4 py-2 text-sm hover:bg-gray-600 disabled:opacity-50"
                @click="() => { /* TODO: Implement spectate */ }"
              >
                Spectate
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- Create Session Modal -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      @click.self="showCreateModal = false"
    >
      <div class="w-full max-w-md rounded-lg border border-gray-700 bg-gray-800 p-6">
        <h2 class="mb-4 text-xl font-bold">Create New Game</h2>

        <div class="mb-4">
          <label class="mb-1 block text-sm text-gray-400">Game Name</label>
          <input
            v-model="newSessionName"
            type="text"
            placeholder="Enter a name for your game..."
            class="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 focus:border-indigo-500 focus:outline-none"
            maxlength="50"
          />
        </div>

        <div class="mb-6">
          <label class="mb-2 block text-sm text-gray-400">Game Type</label>
          <div class="grid grid-cols-2 gap-3">
            <button
              :class="[
                'rounded border p-3 text-left transition',
                newSessionType === 'KING_OF_THE_HILL'
                  ? 'border-indigo-500 bg-indigo-900/30'
                  : 'border-gray-600 bg-gray-700 hover:border-gray-500'
              ]"
              @click="newSessionType = 'KING_OF_THE_HILL'"
            >
              <div class="font-semibold">King of the Hill</div>
              <div class="mt-1 text-xs text-gray-400">Hold the crown for 48h to win</div>
            </button>
            <button
              :class="[
                'rounded border p-3 text-left transition',
                newSessionType === 'DOMINATION'
                  ? 'border-indigo-500 bg-indigo-900/30'
                  : 'border-gray-600 bg-gray-700 hover:border-gray-500'
              ]"
              @click="newSessionType = 'DOMINATION'"
            >
              <div class="font-semibold">Domination</div>
              <div class="mt-1 text-xs text-gray-400">Conquer all enemy HQs to win</div>
            </button>
          </div>
        </div>

        <div class="flex justify-end gap-3">
          <button
            class="rounded bg-gray-700 px-4 py-2 hover:bg-gray-600"
            @click="showCreateModal = false"
          >
            Cancel
          </button>
          <button
            :disabled="!newSessionName.trim() || sessionStore.isLoading"
            class="rounded bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500 disabled:opacity-50"
            @click="handleCreateSession"
          >
            Create Game
          </button>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>
