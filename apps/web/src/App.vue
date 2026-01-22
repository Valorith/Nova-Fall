<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { RouterView } from 'vue-router';
import AppShell from '@/components/common/AppShell.vue';
import ToastContainer from '@/components/ui/ToastContainer.vue';
import { useItemsStore } from '@/stores/items';
import { useAuthStore } from '@/stores/auth';
import { initMetricsTracker } from '@/utils/metricsTracker';

const itemsStore = useItemsStore();
const authStore = useAuthStore();

// Load item definitions only when authenticated
onMounted(() => {
  if (authStore.isAuthenticated) {
    itemsStore.loadItems();
  }
  initMetricsTracker();
});

// Watch for authentication changes to load items after login
watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth && !itemsStore.isLoaded) {
      itemsStore.loadItems();
    }
  }
);
</script>

<template>
  <AppShell>
    <RouterView />
  </AppShell>
  <ToastContainer />
</template>
