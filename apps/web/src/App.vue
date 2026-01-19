<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterView } from 'vue-router';
import AppShell from '@/components/common/AppShell.vue';
import ToastContainer from '@/components/ui/ToastContainer.vue';
import { useItemsStore } from '@/stores/items';
import { initMetricsTracker } from '@/utils/metricsTracker';

const itemsStore = useItemsStore();

// Load item definitions on app start
onMounted(() => {
  itemsStore.loadItems();
  initMetricsTracker();
});
</script>

<template>
  <AppShell>
    <RouterView />
  </AppShell>
  <ToastContainer />
</template>
