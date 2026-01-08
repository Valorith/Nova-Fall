<script setup lang="ts">
import { ref } from 'vue';
import type { ResourceStorage } from '@nova-fall/shared';

const props = defineProps<{
  resources: ResourceStorage;
  canClaimNode?: boolean;
  selectedNodeName?: string;
}>();

const emit = defineEmits<{
  (e: 'update:resources', resources: ResourceStorage): void;
  (e: 'claim-free'): void;
}>();

const isOpen = ref(false);

// Local editable values
const credits = ref(props.resources.credits ?? 0);
const iron = ref(props.resources.iron ?? 0);
const energy = ref(props.resources.energy ?? 0);
const minerals = ref(props.resources.minerals ?? 0);
const composites = ref(props.resources.composites ?? 0);

function togglePanel() {
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    // Sync local values with props when opening
    credits.value = props.resources.credits ?? 0;
    iron.value = props.resources.iron ?? 0;
    energy.value = props.resources.energy ?? 0;
    minerals.value = props.resources.minerals ?? 0;
    composites.value = props.resources.composites ?? 0;
  }
}

function applyChanges() {
  emit('update:resources', {
    credits: credits.value,
    iron: iron.value,
    energy: energy.value,
    minerals: minerals.value,
    composites: composites.value,
  });
}

function addCredits(amount: number) {
  credits.value = Math.max(0, credits.value + amount);
  applyChanges();
}
</script>

<template>
  <div class="dev-panel">
    <!-- Toggle Button -->
    <button
      class="dev-panel__toggle"
      :class="{ 'dev-panel__toggle--active': isOpen }"
      title="Dev Panel"
      @click="togglePanel"
    >
      <svg class="dev-panel__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    </button>

    <!-- Panel -->
    <Transition name="slide">
      <div v-if="isOpen" class="dev-panel__content">
        <div class="dev-panel__header">
          <span class="dev-panel__title">Dev Panel</span>
          <button class="dev-panel__close" @click="isOpen = false">&times;</button>
        </div>

        <div class="dev-panel__section">
          <h4 class="dev-panel__section-title">Resources</h4>

          <!-- Credits -->
          <div class="dev-panel__field">
            <label class="dev-panel__label">Credits</label>
            <div class="dev-panel__input-group">
              <input
                v-model.number="credits"
                type="number"
                class="dev-panel__input"
                min="0"
                @change="applyChanges"
              />
              <button class="dev-panel__btn dev-panel__btn--small" @click="addCredits(100)">+100</button>
              <button class="dev-panel__btn dev-panel__btn--small" @click="addCredits(1000)">+1k</button>
            </div>
          </div>

          <!-- Iron -->
          <div class="dev-panel__field">
            <label class="dev-panel__label">Iron</label>
            <input
              v-model.number="iron"
              type="number"
              class="dev-panel__input"
              min="0"
              @change="applyChanges"
            />
          </div>

          <!-- Energy -->
          <div class="dev-panel__field">
            <label class="dev-panel__label">Energy</label>
            <input
              v-model.number="energy"
              type="number"
              class="dev-panel__input"
              min="0"
              @change="applyChanges"
            />
          </div>

          <!-- Minerals -->
          <div class="dev-panel__field">
            <label class="dev-panel__label">Minerals</label>
            <input
              v-model.number="minerals"
              type="number"
              class="dev-panel__input"
              min="0"
              @change="applyChanges"
            />
          </div>

          <!-- Composites -->
          <div class="dev-panel__field">
            <label class="dev-panel__label">Composites</label>
            <input
              v-model.number="composites"
              type="number"
              class="dev-panel__input"
              min="0"
              @change="applyChanges"
            />
          </div>
        </div>

        <div class="dev-panel__section">
          <h4 class="dev-panel__section-title">Quick Actions</h4>
          <div class="dev-panel__actions">
            <button class="dev-panel__btn" @click="addCredits(10000)">+10k Credits</button>
          </div>
        </div>

        <!-- Node Actions -->
        <div v-if="canClaimNode" class="dev-panel__section">
          <h4 class="dev-panel__section-title">Node Actions</h4>
          <p class="dev-panel__node-name">{{ selectedNodeName }}</p>
          <button class="dev-panel__btn dev-panel__btn--claim" @click="emit('claim-free')">
            Claim for Free
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dev-panel {
  position: relative;
}

.dev-panel__toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: rgba(30, 30, 40, 0.9);
  border: 1px solid rgba(100, 100, 120, 0.4);
  border-radius: 6px;
  color: #888;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dev-panel__toggle:hover {
  background: rgba(50, 50, 60, 0.95);
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.4);
}

.dev-panel__toggle--active {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.5);
}

.dev-panel__icon {
  width: 18px;
  height: 18px;
}

.dev-panel__content {
  position: absolute;
  top: 44px;
  left: 0;
  width: 240px;
  background: rgba(20, 20, 28, 0.98);
  border: 1px solid rgba(100, 100, 120, 0.3);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  z-index: 100;
}

.dev-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: rgba(251, 191, 36, 0.1);
  border-bottom: 1px solid rgba(251, 191, 36, 0.2);
}

.dev-panel__title {
  font-size: 12px;
  font-weight: 600;
  color: #fbbf24;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.dev-panel__close {
  background: none;
  border: none;
  color: #888;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.dev-panel__close:hover {
  color: #fff;
}

.dev-panel__section {
  padding: 12px;
  border-bottom: 1px solid rgba(100, 100, 120, 0.2);
}

.dev-panel__section:last-child {
  border-bottom: none;
}

.dev-panel__section-title {
  margin: 0 0 10px 0;
  font-size: 10px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.dev-panel__field {
  margin-bottom: 8px;
}

.dev-panel__field:last-child {
  margin-bottom: 0;
}

.dev-panel__label {
  display: block;
  font-size: 11px;
  color: #999;
  margin-bottom: 4px;
}

.dev-panel__input-group {
  display: flex;
  gap: 4px;
}

.dev-panel__input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(100, 100, 120, 0.3);
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  font-family: monospace;
}

.dev-panel__input:focus {
  outline: none;
  border-color: rgba(251, 191, 36, 0.5);
}

.dev-panel__input::-webkit-inner-spin-button,
.dev-panel__input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.dev-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dev-panel__btn {
  padding: 6px 10px;
  background: rgba(100, 100, 120, 0.2);
  border: 1px solid rgba(100, 100, 120, 0.3);
  border-radius: 4px;
  color: #ccc;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.dev-panel__btn:hover {
  background: rgba(251, 191, 36, 0.2);
  border-color: rgba(251, 191, 36, 0.4);
  color: #fbbf24;
}

.dev-panel__btn--small {
  padding: 4px 6px;
  font-size: 10px;
}

.dev-panel__btn--claim {
  width: 100%;
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.4);
  color: #4ade80;
}

.dev-panel__btn--claim:hover {
  background: rgba(34, 197, 94, 0.3);
  border-color: rgba(34, 197, 94, 0.6);
  color: #86efac;
}

.dev-panel__node-name {
  margin: 0 0 8px 0;
  font-size: 11px;
  color: #ccc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Transition */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
