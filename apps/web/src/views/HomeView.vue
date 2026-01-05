<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

function goToLogin() {
  router.push('/login');
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white">
    <h1 class="mb-4 text-6xl font-bold text-orange-500">Nova Fall</h1>
    <p class="mb-8 text-xl text-gray-400">Colonize. Build. Conquer.</p>
    <button
      class="rounded-lg bg-orange-600 px-8 py-3 text-lg font-semibold transition-colors hover:bg-orange-500"
      @click="goToLogin"
    >
      Enter the Colony
    </button>
  </div>
</template>
