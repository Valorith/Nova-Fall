<script setup lang="ts">
import { ref } from 'vue';
import BlueprintEditor from '@/components/dev/BlueprintEditor.vue';
import ItemsEditor from '@/components/dev/ItemsEditor.vue';
import UnitsEditor from '@/components/dev/UnitsEditor.vue';
import BuildingsEditor from '@/components/dev/BuildingsEditor.vue';
import SettingsEditor from '@/components/dev/SettingsEditor.vue';

// Dev panel tabs
type DevTab = 'blueprints' | 'items' | 'units' | 'buildings' | 'settings' | 'debug';

const activeTab = ref<DevTab>('blueprints');

const tabs: { id: DevTab; label: string; icon: string }[] = [
  { id: 'blueprints', label: 'Blueprints', icon: 'B' },
  { id: 'items', label: 'Items', icon: 'I' },
  { id: 'units', label: 'Units', icon: 'U' },
  { id: 'buildings', label: 'Buildings', icon: 'G' },
  { id: 'settings', label: 'Settings', icon: 'S' },
  { id: 'debug', label: 'Debug', icon: 'D' },
];
</script>

<template>
  <div class="dev-view">
    <!-- Sidebar navigation -->
    <nav class="dev-sidebar">
      <div class="sidebar-header">
        <span class="dev-badge">DEV</span>
        <h1>Nova Fall</h1>
      </div>

      <div class="nav-items">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="nav-item"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          <span class="nav-icon">{{ tab.icon }}</span>
          <span class="nav-label">{{ tab.label }}</span>
        </button>
      </div>

      <div class="sidebar-footer">
        <router-link to="/lobby" class="back-link">
          &larr; Back to Game
        </router-link>
      </div>
    </nav>

    <!-- Main content area -->
    <main class="dev-content">
      <BlueprintEditor v-if="activeTab === 'blueprints'" />

      <ItemsEditor v-else-if="activeTab === 'items'" />

      <UnitsEditor v-else-if="activeTab === 'units'" />

      <BuildingsEditor v-else-if="activeTab === 'buildings'" />

      <SettingsEditor v-else-if="activeTab === 'settings'" />

      <div v-else-if="activeTab === 'debug'" class="placeholder-panel">
        <h2>Debug Tools</h2>
        <p>Coming soon - Game state inspection and manipulation</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.dev-view {
  display: flex;
  height: 100vh;
  background: #0a0d12;
  color: #e5e5e5;
}

/* Sidebar */
.dev-sidebar {
  width: 220px;
  display: flex;
  flex-direction: column;
  background: #0f1419;
  border-right: 1px solid #1e2533;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 16px;
  border-bottom: 1px solid #1e2533;
}

.dev-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 4px 8px;
  background: linear-gradient(135deg, #f97316, #dc2626);
  color: white;
  border-radius: 4px;
  letter-spacing: 1px;
}

.sidebar-header h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #9ca3af;
}

.nav-items {
  flex: 1;
  padding: 12px 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  margin-bottom: 4px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #9ca3af;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.nav-item:hover {
  background: #1a1f2e;
  color: #e5e5e5;
}

.nav-item.active {
  background: #1e293b;
  color: #3b82f6;
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: #1a1f2e;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}

.nav-item.active .nav-icon {
  background: rgba(59, 130, 246, 0.2);
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid #1e2533;
}

.back-link {
  display: block;
  padding: 12px 16px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  border-radius: 8px;
  color: #ffffff;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  text-align: center;
  transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.back-link:hover {
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  transform: translateY(-1px);
}

/* Content */
.dev-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.placeholder-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #6b7280;
}

.placeholder-panel h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
  color: #9ca3af;
}

.placeholder-panel p {
  margin: 0;
  font-size: 14px;
}
</style>
