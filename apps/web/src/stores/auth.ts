import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

interface User {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string;
  isPremium: boolean;
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(localStorage.getItem('auth_token'));
  const isLoading = ref(false);

  const isAuthenticated = computed(() => !!token.value && !!user.value);

  function setToken(newToken: string | null) {
    token.value = newToken;
    if (newToken) {
      localStorage.setItem('auth_token', newToken);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  function setUser(newUser: User | null) {
    user.value = newUser;
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return {
    user,
    token,
    isLoading,
    isAuthenticated,
    setToken,
    setUser,
    logout,
  };
});
