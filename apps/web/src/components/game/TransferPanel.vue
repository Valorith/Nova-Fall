<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { transfersApi, type TransferResponse, type CreateTransferRequest } from '@/services/api';
import { useGameStore } from '@/stores/game';
import { useItemsStore } from '@/stores/items';
import type { MapNode, ItemStorage } from '@nova-fall/shared';

const props = defineProps<{
  sourceNode: MapNode;
  destNode: MapNode; // Pre-selected destination node
  nodeStorage: ItemStorage;
}>();

const emit = defineEmits<{
  close: [];
  transferCreated: [transfer: TransferResponse];
  transferCancelled: [transfer: TransferResponse];
}>();

const gameStore = useGameStore();
const itemsStore = useItemsStore();

// State
const isLoading = ref(false);
const pendingTransfers = ref<TransferResponse[]>([]);
const transferAmounts = ref<Record<string, number>>({});
const error = ref<string | null>(null);
const success = ref<string | null>(null);

const transferableResources = computed(() => {
  const items: { type: string; name: string; available: number; icon: string | null; isIconUrl: boolean }[] = [];
  const storage = props.nodeStorage as ItemStorage;

  for (const [type, amount] of Object.entries(storage)) {
    if (type === 'credits' || !amount || amount <= 0) continue;
    const display = itemsStore.getItemDisplay(type);
    items.push({
      type,
      name: display.name,
      available: amount,
      icon: display.icon,
      isIconUrl: itemsStore.isIconUrl(display.icon),
    });
  }

  return items;
});

const hasAnyTransfer = computed(() => {
  return Object.values(transferAmounts.value).some(amount => amount > 0);
});

const transferPreview = computed(() => {
  const items: { type: string; name: string; amount: number; icon: string | null; isIconUrl: boolean }[] = [];
  for (const [type, amount] of Object.entries(transferAmounts.value)) {
    if (amount > 0) {
      const display = itemsStore.getItemDisplay(type);
      items.push({
        type,
        name: display.name,
        amount,
        icon: display.icon,
        isIconUrl: itemsStore.isIconUrl(display.icon),
      });
    }
  }
  return items;
});

// Source node's pending transfers (outgoing)
const sourceNodeTransfers = computed(() => {
  return pendingTransfers.value.filter(t => t.sourceNodeId === props.sourceNode.id);
});

// Get node name by ID
function getNodeName(nodeId: string): string {
  const node = gameStore.getNode(nodeId);
  return node?.name ?? 'Unknown';
}

// Format time remaining
function formatTimeRemaining(completesAt: string): string {
  const remaining = new Date(completesAt).getTime() - Date.now();
  if (remaining <= 0) return 'Arriving...';

  const seconds = Math.floor(remaining / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

// Load pending transfers
async function loadTransfers() {
  try {
    const response = await transfersApi.getAll();
    pendingTransfers.value = response.data.transfers;
  } catch (err) {
    console.error('Failed to load transfers:', err);
  }
}

// Create transfer
async function createTransfer() {
  if (!hasAnyTransfer.value) return;

  isLoading.value = true;
  error.value = null;
  success.value = null;

  try {
    const resources: Record<string, number> = {};
    for (const [type, amount] of Object.entries(transferAmounts.value)) {
      if (amount > 0) {
        resources[type] = amount;
      }
    }

    const request: CreateTransferRequest = {
      sourceNodeId: props.sourceNode.id,
      destNodeId: props.destNode.id,
      resources,
    };

    const response = await transfersApi.create(request);
    success.value = response.data.message;

    // Reset form
    transferAmounts.value = {};

    // Reload transfers
    await loadTransfers();

    // Emit with the created transfer so parent can update storage
    emit('transferCreated', response.data.transfer);

    // Clear success after 3 seconds
    setTimeout(() => {
      success.value = null;
    }, 3000);
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { error?: string } } };
    error.value = axiosError.response?.data?.error ?? 'Failed to create transfer';
  } finally {
    isLoading.value = false;
  }
}

// Cancel transfer
async function cancelTransfer(transferId: string) {
  isLoading.value = true;
  error.value = null;

  try {
    const response = await transfersApi.cancel(transferId);
    await loadTransfers();
    success.value = 'Transfer cancelled, resources returned';

    // Emit with the cancelled transfer so parent can update storage
    emit('transferCancelled', response.data.transfer);

    setTimeout(() => {
      success.value = null;
    }, 3000);
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { error?: string } } };
    error.value = axiosError.response?.data?.error ?? 'Failed to cancel transfer';
  } finally {
    isLoading.value = false;
  }
}

// Set max amount for a resource
function setMax(type: string) {
  const resource = transferableResources.value.find(r => r.type === type);
  if (resource) {
    transferAmounts.value[type] = resource.available;
  }
}

// Initialize
onMounted(() => {
  loadTransfers();
});

// Reload when source or dest node changes
watch([() => props.sourceNode.id, () => props.destNode.id], () => {
  loadTransfers();
  transferAmounts.value = {};
});
</script>

<template>
  <div class="transfer-panel">
    <!-- Header -->
    <div class="transfer-panel__header">
      <h3 class="transfer-panel__title">Resource Transfer</h3>
      <button class="transfer-panel__close" @click="emit('close')">
        &times;
      </button>
    </div>

    <!-- Messages -->
    <div v-if="error" class="transfer-panel__error">
      {{ error }}
    </div>
    <div v-if="success" class="transfer-panel__success">
      {{ success }}
    </div>

    <!-- Pending Transfers -->
    <div v-if="sourceNodeTransfers.length > 0" class="transfer-panel__pending">
      <h4 class="transfer-panel__section-title">Pending Transfers</h4>
      <div class="transfer-panel__transfers">
        <div
          v-for="transfer in sourceNodeTransfers"
          :key="transfer.id"
          class="transfer-panel__transfer"
        >
          <div class="transfer-panel__transfer-route">
            <span class="transfer-panel__transfer-from">{{ getNodeName(transfer.sourceNodeId) }}</span>
            <span class="transfer-panel__transfer-arrow">&rarr;</span>
            <span class="transfer-panel__transfer-to">{{ getNodeName(transfer.destNodeId) }}</span>
          </div>
          <div class="transfer-panel__transfer-resources">
            <span v-for="(amount, type) in transfer.resources" :key="type" class="transfer-panel__transfer-resource">
              {{ amount }} {{ itemsStore.getItemName(type as string) }}
            </span>
          </div>
          <div class="transfer-panel__transfer-time">
            {{ formatTimeRemaining(transfer.completesAt) }}
          </div>
          <button
            class="transfer-panel__cancel-btn"
            :disabled="isLoading"
            @click="cancelTransfer(transfer.id)"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- New Transfer -->
    <div class="transfer-panel__new">
      <h4 class="transfer-panel__section-title">New Transfer</h4>

      <!-- Transfer Route -->
      <div class="transfer-panel__route">
        <div class="transfer-panel__route-node">
          <span class="transfer-panel__route-label">From</span>
          <span class="transfer-panel__route-name">{{ sourceNode.name }}</span>
        </div>
        <span class="transfer-panel__route-arrow">→</span>
        <div class="transfer-panel__route-node">
          <span class="transfer-panel__route-label">To</span>
          <span class="transfer-panel__route-name">{{ destNode.name }}</span>
        </div>
      </div>

      <!-- Resource Selection -->
      <div class="transfer-panel__resources">
        <label class="transfer-panel__label">Resources:</label>

        <div v-if="transferableResources.length === 0" class="transfer-panel__warning">
          No resources available to transfer.
        </div>

        <div
          v-for="resource in transferableResources"
          :key="resource.type"
          class="transfer-panel__resource-row"
        >
          <span class="transfer-panel__resource-name">
            <template v-if="resource.isIconUrl">
              <img :src="resource.icon!" :alt="resource.name" class="inline w-4 h-4 mr-1 align-middle" />
            </template>
            <template v-else>{{ resource.icon ?? '📦' }}</template>
            {{ resource.name }}
          </span>
          <span class="transfer-panel__resource-available">
            ({{ resource.available }} available)
          </span>
          <input
            v-model.number="transferAmounts[resource.type]"
            type="number"
            min="0"
            :max="resource.available"
            class="transfer-panel__resource-input"
            placeholder="0"
          />
          <button
            class="transfer-panel__max-btn"
            @click="setMax(resource.type)"
          >
            MAX
          </button>
        </div>
      </div>

      <!-- Transfer Preview -->
      <div v-if="hasAnyTransfer" class="transfer-panel__preview">
        <div class="transfer-panel__preview-title">Transfer Summary:</div>
        <div class="transfer-panel__preview-items">
          <span v-for="item in transferPreview" :key="item.type" class="transfer-panel__preview-item">
            <template v-if="item.isIconUrl">
              <img :src="item.icon!" :alt="item.name" class="inline w-4 h-4 mr-1 align-middle" />
            </template>
            <template v-else>{{ item.icon ?? '📦' }}</template>
            {{ item.amount }} {{ item.name }}
          </span>
        </div>
        <div class="transfer-panel__preview-time">
          Arrival in ~30 seconds
        </div>
      </div>

      <!-- Submit Button -->
      <button
        class="transfer-panel__submit"
        :disabled="!hasAnyTransfer || isLoading"
        @click="createTransfer"
      >
        {{ isLoading ? 'Transferring...' : 'Start Transfer' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.transfer-panel {
  background: rgba(15, 23, 42, 0.98);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.5rem;
  padding: 1rem;
  max-width: 400px;
  max-height: 80vh;
  overflow-y: auto;
}

.transfer-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.transfer-panel__title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #f1f5f9;
}

.transfer-panel__close {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.transfer-panel__close:hover {
  color: #f1f5f9;
}

.transfer-panel__error {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.transfer-panel__success {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #86efac;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.transfer-panel__warning {
  color: #fcd34d;
  font-size: 0.8125rem;
  padding: 0.5rem;
  background: rgba(234, 179, 8, 0.1);
  border-radius: 0.25rem;
}

.transfer-panel__section-title {
  margin: 0 0 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.transfer-panel__pending {
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.transfer-panel__transfers {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.transfer-panel__transfer {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.5rem;
  align-items: center;
  padding: 0.5rem;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 0.375rem;
}

.transfer-panel__transfer-route {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
}

.transfer-panel__transfer-from,
.transfer-panel__transfer-to {
  color: #e2e8f0;
}

.transfer-panel__transfer-arrow {
  color: #64748b;
}

.transfer-panel__transfer-resources {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.transfer-panel__transfer-resource {
  font-size: 0.75rem;
  color: #a5b4fc;
  background: rgba(99, 102, 241, 0.15);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
}

.transfer-panel__transfer-time {
  font-size: 0.75rem;
  color: #fcd34d;
  font-family: monospace;
}

.transfer-panel__cancel-btn {
  padding: 0.25rem 0.5rem;
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  cursor: pointer;
}

.transfer-panel__cancel-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.3);
}

.transfer-panel__cancel-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.transfer-panel__route {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.75rem;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 0.375rem;
  margin-bottom: 1rem;
}

.transfer-panel__route-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.transfer-panel__route-label {
  font-size: 0.625rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.transfer-panel__route-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: #e2e8f0;
}

.transfer-panel__route-arrow {
  font-size: 1.25rem;
  color: #6366f1;
}

.transfer-panel__label {
  display: block;
  font-size: 0.8125rem;
  color: #94a3b8;
  margin-bottom: 0.375rem;
}

.transfer-panel__resources {
  margin-bottom: 1rem;
}

.transfer-panel__resource-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  padding: 0.375rem;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 0.25rem;
}

.transfer-panel__resource-name {
  font-size: 0.8125rem;
  color: #e2e8f0;
  min-width: 100px;
}

.transfer-panel__resource-available {
  font-size: 0.75rem;
  color: #64748b;
  flex: 1;
}

.transfer-panel__resource-input {
  width: 70px;
  padding: 0.25rem 0.5rem;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.25rem;
  color: #f1f5f9;
  font-size: 0.875rem;
  text-align: right;
}

.transfer-panel__resource-input:focus {
  outline: none;
  border-color: rgba(99, 102, 241, 0.5);
}

.transfer-panel__max-btn {
  padding: 0.25rem 0.5rem;
  background: rgba(99, 102, 241, 0.2);
  border: 1px solid rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 600;
  cursor: pointer;
}

.transfer-panel__max-btn:hover {
  background: rgba(99, 102, 241, 0.3);
}

.transfer-panel__preview {
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 0.375rem;
  padding: 0.75rem;
  margin-bottom: 1rem;
}

.transfer-panel__preview-title {
  font-size: 0.75rem;
  color: #94a3b8;
  margin-bottom: 0.5rem;
}

.transfer-panel__preview-items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.transfer-panel__preview-item {
  font-size: 0.875rem;
  color: #a5b4fc;
  font-weight: 500;
}

.transfer-panel__preview-time {
  font-size: 0.75rem;
  color: #64748b;
}

.transfer-panel__submit {
  width: 100%;
  padding: 0.625rem;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  border: none;
  border-radius: 0.375rem;
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.transfer-panel__submit:hover:not(:disabled) {
  opacity: 0.9;
}

.transfer-panel__submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #374151;
}
</style>
