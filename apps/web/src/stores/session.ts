import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { sessionsApi, type CreateSessionRequest } from '@/services/api';
import { useAuthStore } from './auth';

export type GameType = 'KING_OF_THE_HILL' | 'DOMINATION';
export type SessionStatus = 'LOBBY' | 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
export type SessionRole = 'PLAYER' | 'SPECTATOR';

export interface SessionPlayer {
  id: string;
  playerId: string;
  displayName: string;
  role: SessionRole;
  isCreator: boolean;
  hqNodeId: string | null;
  totalNodes: number;
  eliminatedAt: string | null;
  joinedAt: string;
}

export interface SessionListItem {
  id: string;
  name: string;
  gameType: GameType;
  status: SessionStatus;
  playerCount: number;
  minPlayers: number;
  creatorId: string;
  creatorName: string;
  createdAt: string;
  startedAt: string | null;
}

export interface SessionDetail {
  id: string;
  name: string;
  gameType: GameType;
  status: SessionStatus;
  minPlayers: number;
  creatorId: string;
  crownNodeId: string | null;
  crownHolderId: string | null;
  crownHeldSince: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  winnerId: string | null;
  players: SessionPlayer[];
}

export const useSessionStore = defineStore('session', () => {
  const availableSessions = ref<SessionListItem[]>([]);
  const currentSession = ref<SessionDetail | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const authStore = useAuthStore();

  const hasActiveSession = computed(() => !!authStore.user?.activeSession);
  const activeSessionId = computed(() => authStore.user?.activeSession?.id ?? null);

  async function fetchSessions() {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await sessionsApi.getAll({ status: 'LOBBY' });
      availableSessions.value = response.data.sessions;
    } catch (e) {
      error.value = 'Failed to fetch sessions';
      console.error('Failed to fetch sessions:', e);
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchSessionById(sessionId: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await sessionsApi.getById(sessionId);
      currentSession.value = response.data.session;
    } catch (e) {
      error.value = 'Failed to fetch session details';
      console.error('Failed to fetch session:', e);
    } finally {
      isLoading.value = false;
    }
  }

  async function createSession(name: string, gameType: GameType) {
    isLoading.value = true;
    error.value = null;
    try {
      const request: CreateSessionRequest = { name, gameType };
      const response = await sessionsApi.create(request);
      currentSession.value = response.data.session;
      // Refresh auth to update activeSession
      await authStore.fetchUser();
      return response.data.session;
    } catch (e: unknown) {
      const axiosError = e as { response?: { data?: { error?: string } } };
      error.value = axiosError.response?.data?.error ?? 'Failed to create session';
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function joinSession(sessionId: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await sessionsApi.join(sessionId);
      currentSession.value = response.data.session;
      // Refresh auth to update activeSession
      await authStore.fetchUser();
      return response.data.session;
    } catch (e: unknown) {
      const axiosError = e as { response?: { data?: { error?: string } } };
      error.value = axiosError.response?.data?.error ?? 'Failed to join session';
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function spectateSession(sessionId: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await sessionsApi.spectate(sessionId);
      currentSession.value = response.data.session;
      return response.data.session;
    } catch (e: unknown) {
      const axiosError = e as { response?: { data?: { error?: string } } };
      error.value = axiosError.response?.data?.error ?? 'Failed to spectate session';
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function leaveSession(sessionId: string) {
    isLoading.value = true;
    error.value = null;
    try {
      await sessionsApi.leave(sessionId);
      currentSession.value = null;
      // Refresh auth to update activeSession
      await authStore.fetchUser();
      // Refresh available sessions
      await fetchSessions();
    } catch (e: unknown) {
      const axiosError = e as { response?: { data?: { error?: string } } };
      error.value = axiosError.response?.data?.error ?? 'Failed to leave session';
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function startSession(sessionId: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await sessionsApi.start(sessionId);
      currentSession.value = response.data.session;
      // Refresh auth to update activeSession status
      await authStore.fetchUser();
      return response.data.session;
    } catch (e: unknown) {
      const axiosError = e as { response?: { data?: { error?: string } } };
      error.value = axiosError.response?.data?.error ?? 'Failed to start session';
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  function clearError() {
    error.value = null;
  }

  return {
    availableSessions,
    currentSession,
    isLoading,
    error,
    hasActiveSession,
    activeSessionId,
    fetchSessions,
    fetchSessionById,
    createSession,
    joinSession,
    spectateSession,
    leaveSession,
    startSession,
    clearError,
  };
});
