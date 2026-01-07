<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useSessionStore, type GameType, type SessionListItem } from '@/stores/session';

const router = useRouter();
const authStore = useAuthStore();
const sessionStore = useSessionStore();

const showCreateModal = ref(false);
const newSessionName = ref('');
const newSessionType = ref<GameType>('KING_OF_THE_HILL');

const activeSession = computed(() => authStore.user?.activeSession);
const isCreator = computed(() => activeSession.value?.isCreator ?? false);
const canStart = computed(() => {
  if (!sessionStore.currentSession) return false;
  const playerCount = sessionStore.currentSession.players.filter(p => p.role === 'PLAYER').length;
  return isCreator.value &&
         sessionStore.currentSession.status === 'LOBBY' &&
         playerCount >= sessionStore.currentSession.minPlayers;
});

onMounted(async () => {
  await sessionStore.fetchSessions();

  // If user has an active session in LOBBY, fetch its details
  if (activeSession.value && activeSession.value.status === 'LOBBY') {
    await sessionStore.fetchSessionById(activeSession.value.id);
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

function handleContinue() {
  if (!activeSession.value) return;
  router.push(`/game/${activeSession.value.id}`);
}

function formatGameType(type: GameType): string {
  return type === 'KING_OF_THE_HILL' ? 'KOTH' : 'DOM';
}

function getPlayerCount(session: SessionListItem): string {
  return `${session.playerCount}/${session.minPlayers}+ players`;
}

function handleLogout() {
  authStore.logout();
  router.push('/login');
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white">
    <!-- Header -->
    <header class="border-b border-gray-800 bg-gray-900/95 px-6 py-4">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-indigo-400">NOVA FALL</h1>
        <div class="flex items-center gap-4">
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
          <div class="flex items-center justify-between">
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
              </div>

              <!-- Session details when in LOBBY -->
              <div v-if="sessionStore.currentSession && activeSession.status === 'LOBBY'" class="mt-3">
                <p class="text-sm text-gray-400">
                  {{ sessionStore.currentSession.players.filter(p => p.role === 'PLAYER').length }} /
                  {{ sessionStore.currentSession.minPlayers }}+ players ready
                </p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <span
                    v-for="player in sessionStore.currentSession.players.filter(p => p.role === 'PLAYER')"
                    :key="player.id"
                    class="rounded bg-gray-700 px-2 py-1 text-sm"
                    :class="{ 'bg-indigo-900': player.isCreator }"
                  >
                    {{ player.displayName }}
                    <span v-if="player.isCreator" class="text-xs text-indigo-400">(host)</span>
                  </span>
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
                  Continue
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
</template>
