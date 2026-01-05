<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const error = ref<string | null>(null);

onMounted(async () => {
  const accessToken = route.query.accessToken as string | undefined;
  const refreshToken = route.query.refreshToken as string | undefined;
  const errorParam = route.query.error as string | undefined;

  if (errorParam) {
    error.value = getErrorMessage(errorParam);
    setTimeout(() => {
      router.push('/login');
    }, 3000);
    return;
  }

  if (!accessToken || !refreshToken) {
    error.value = 'Authentication failed. Missing tokens.';
    setTimeout(() => {
      router.push('/login');
    }, 3000);
    return;
  }

  // Store tokens and fetch user
  authStore.setTokens(accessToken, refreshToken);
  await authStore.fetchUser();

  if (authStore.isAuthenticated) {
    router.push('/game');
  } else {
    error.value = 'Authentication failed. Please try again.';
    setTimeout(() => {
      router.push('/login');
    }, 3000);
  }
});

function getErrorMessage(code: string): string {
  switch (code) {
    case 'discord_failed':
      return 'Discord authentication failed. Please try again.';
    case 'google_failed':
      return 'Google authentication failed. Please try again.';
    case 'no_profile':
      return 'Could not retrieve your profile. Please try again.';
    default:
      return 'Authentication failed. Please try again.';
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white">
    <div v-if="error" class="text-center">
      <div class="mb-4 text-red-500">
        <svg class="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h1 class="text-2xl font-bold">{{ error }}</h1>
      <p class="mt-2 text-gray-400">Redirecting to login...</p>
    </div>

    <div v-else class="text-center">
      <div class="mb-4">
        <svg
          class="mx-auto h-16 w-16 animate-spin text-indigo-500"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
      <h1 class="text-2xl font-bold">Signing you in...</h1>
      <p class="mt-2 text-gray-400">Please wait while we complete authentication.</p>
    </div>
  </div>
</template>
