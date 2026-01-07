import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi } from '@/services/api';

interface ActiveSession {
  id: string;
  name: string;
  gameType: 'KING_OF_THE_HILL' | 'DOMINATION';
  status: 'LOBBY' | 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  role: 'PLAYER' | 'SPECTATOR';
  isCreator: boolean;
}

interface User {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  isPremium: boolean;
  playerId: string | null;
  activeSession?: ActiveSession;
}

const ACCESS_TOKEN_KEY = 'nova_access_token';
const REFRESH_TOKEN_KEY = 'nova_refresh_token';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const accessToken = ref<string | null>(localStorage.getItem(ACCESS_TOKEN_KEY));
  const refreshToken = ref<string | null>(localStorage.getItem(REFRESH_TOKEN_KEY));
  const isLoading = ref(false);
  const isInitialized = ref(false);

  const isAuthenticated = computed(() => !!accessToken.value && !!user.value);

  function setTokens(newAccessToken: string | null, newRefreshToken: string | null) {
    accessToken.value = newAccessToken;
    refreshToken.value = newRefreshToken;

    if (newAccessToken) {
      localStorage.setItem(ACCESS_TOKEN_KEY, newAccessToken);
    } else {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
    }

    if (newRefreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  }

  function setUser(newUser: User | null) {
    user.value = newUser;
  }

  async function fetchUser() {
    if (!accessToken.value) {
      isInitialized.value = true;
      return;
    }

    isLoading.value = true;
    try {
      const response = await authApi.getMe();
      user.value = response.data.user;
    } catch {
      // Token invalid, clear auth state
      setTokens(null, null);
      user.value = null;
    } finally {
      isLoading.value = false;
      isInitialized.value = true;
    }
  }

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors
    } finally {
      setTokens(null, null);
      setUser(null);
    }
  }

  async function initialize() {
    if (isInitialized.value) return;
    await fetchUser();
  }

  return {
    user,
    accessToken,
    refreshToken,
    isLoading,
    isAuthenticated,
    isInitialized,
    setTokens,
    setUser,
    fetchUser,
    logout,
    initialize,
  };
});
