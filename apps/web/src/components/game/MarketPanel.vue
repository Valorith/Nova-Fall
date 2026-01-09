<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { marketApi, type MarketPriceInfo } from '@/services/api';
import { RESOURCES, type ResourceStorage, MARKET_TRANSACTION_FEE } from '@nova-fall/shared';

export interface TradeHubNode {
  id: string;
  name: string;
  storage?: Partial<Record<string, number>>;
}

const props = defineProps<{
  credits: number; // Global player credits
  tradeHub: TradeHubNode | null; // The Trade Hub node for this transaction
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'transaction', data: { type: 'BUY' | 'SELL'; resourceType: string; quantity: number }): void;
}>();

// State
const prices = ref<MarketPriceInfo[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const transactionLoading = ref(false);
const transactionMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);

// Selected resource for trading
const selectedResource = ref<string | null>(null);
const tradeMode = ref<'BUY' | 'SELL'>('BUY');
const quantity = ref(1);

// Quick quantity buttons
const quickQuantities = [1, 10, 50, 100];

// Load market prices
async function loadPrices() {
  loading.value = true;
  error.value = null;
  try {
    const response = await marketApi.getPrices();
    prices.value = response.data.prices;
  } catch (err) {
    error.value = 'Failed to load market prices';
    console.error('Failed to load market prices:', err);
  } finally {
    loading.value = false;
  }
}

// Get price info for selected resource
const selectedPrice = computed(() => {
  if (!selectedResource.value) return null;
  return prices.value.find(p => p.resourceType === selectedResource.value) ?? null;
});

// Transaction preview type
interface TransactionPreview {
  mode: 'BUY' | 'SELL';
  baseCost: number;
  baseRevenue: number;
  fee: number;
  total: number;
  net: number;
  canAfford: boolean;
  canSell: boolean;
  available: number;
  creditsAfter: number;
}

// Get Trade Hub storage for selling
const tradeHubStorage = computed((): ResourceStorage => {
  return props.tradeHub?.storage ?? {};
});

// Calculate transaction preview
const transactionPreview = computed((): TransactionPreview | null => {
  if (!selectedPrice.value || quantity.value <= 0) return null;

  const price = selectedPrice.value;

  if (tradeMode.value === 'BUY') {
    const baseCost = price.buyPrice * quantity.value;
    const fee = Math.ceil(baseCost * MARKET_TRANSACTION_FEE);
    const total = baseCost + fee;
    const canAfford = props.credits >= total;

    return {
      mode: 'BUY',
      baseCost,
      baseRevenue: 0,
      fee,
      total,
      net: 0,
      canAfford,
      canSell: false,
      available: 0,
      creditsAfter: props.credits - total,
    };
  } else {
    // For selling, use the Trade Hub's storage
    const available = tradeHubStorage.value[selectedResource.value as keyof ResourceStorage] ?? 0;
    const baseRevenue = price.sellPrice * quantity.value;
    const fee = Math.ceil(baseRevenue * MARKET_TRANSACTION_FEE);
    const net = baseRevenue - fee;
    const canSell = available >= quantity.value;

    return {
      mode: 'SELL',
      baseCost: 0,
      baseRevenue,
      fee,
      total: 0,
      net,
      canAfford: false,
      canSell,
      available,
      creditsAfter: props.credits + net,
    };
  }
});

// Check if transaction is valid
const canExecute = computed(() => {
  if (!props.tradeHub) return false; // Must have a Trade Hub selected
  if (!selectedResource.value || quantity.value <= 0 || !transactionPreview.value) return false;

  if (tradeMode.value === 'BUY') {
    return transactionPreview.value.canAfford;
  } else {
    return transactionPreview.value.canSell;
  }
});

// Execute transaction
async function executeTransaction() {
  if (!canExecute.value || !selectedResource.value || !props.tradeHub) return;

  transactionLoading.value = true;
  transactionMessage.value = null;

  try {
    if (tradeMode.value === 'BUY') {
      const response = await marketApi.buy({
        nodeId: props.tradeHub.id,
        resourceType: selectedResource.value,
        quantity: quantity.value,
      });

      transactionMessage.value = {
        type: 'success',
        text: `Bought ${quantity.value} ${selectedPrice.value?.name} for ${response.data.totalCost} credits`,
      };

      emit('transaction', {
        type: 'BUY',
        resourceType: selectedResource.value,
        quantity: quantity.value,
      });
    } else {
      const response = await marketApi.sell({
        nodeId: props.tradeHub.id,
        resourceType: selectedResource.value,
        quantity: quantity.value,
      });

      transactionMessage.value = {
        type: 'success',
        text: `Sold ${quantity.value} ${selectedPrice.value?.name} for ${response.data.netRevenue} credits`,
      };

      emit('transaction', {
        type: 'SELL',
        resourceType: selectedResource.value,
        quantity: quantity.value,
      });
    }

    // Reset quantity after successful transaction
    quantity.value = 1;

    // Clear success message after 3 seconds
    setTimeout(() => {
      if (transactionMessage.value?.type === 'success') {
        transactionMessage.value = null;
      }
    }, 3000);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
    transactionMessage.value = {
      type: 'error',
      text: (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? errorMessage,
    };
  } finally {
    transactionLoading.value = false;
  }
}

// Set max quantity for selling (from Trade Hub storage)
function setMaxSellQuantity() {
  if (selectedResource.value && tradeMode.value === 'SELL') {
    const available = tradeHubStorage.value[selectedResource.value as keyof ResourceStorage] ?? 0;
    quantity.value = available;
  }
}

// Set max quantity for buying (based on global credits)
function setMaxBuyQuantity() {
  if (selectedPrice.value && tradeMode.value === 'BUY') {
    // Calculate max quantity considering fee
    const priceWithFee = selectedPrice.value.buyPrice * (1 + MARKET_TRANSACTION_FEE);
    quantity.value = Math.floor(props.credits / priceWithFee);
  }
}

// Load prices on mount
onMounted(() => {
  if (props.isOpen) {
    loadPrices();
  }
});

// Reload prices when panel opens
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    loadPrices();
    selectedResource.value = null;
    quantity.value = 1;
    transactionMessage.value = null;
  }
});
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
    @click.self="emit('close')"
  >
    <div class="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div>
          <h2 class="text-lg font-semibold text-gray-100">NPC Market</h2>
          <p v-if="tradeHub" class="text-sm text-gray-400">Trading at {{ tradeHub.name }}</p>
        </div>
        <button
          class="text-gray-400 hover:text-gray-200 transition-colors"
          @click="emit('close')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="p-4 overflow-y-auto max-h-[calc(80vh-60px)]">
        <!-- Loading state -->
        <div v-if="loading" class="flex items-center justify-center py-8">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>

        <!-- Error state -->
        <div v-else-if="error" class="text-center py-8">
          <p class="text-red-400 mb-4">{{ error }}</p>
          <button class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm" @click="loadPrices">
            Retry
          </button>
        </div>

        <!-- Market content -->
        <div v-else class="space-y-4">
          <!-- Info banner -->
          <div class="bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-sm text-blue-300">
            <span class="font-medium">15% transaction fee</span> applies to all trades
          </div>

          <!-- Your Credits -->
          <div class="flex items-center justify-between bg-gray-800/50 rounded-lg px-4 py-3">
            <span class="text-gray-300">Your Credits</span>
            <span class="text-lg font-semibold text-yellow-400">
              {{ RESOURCES.credits.icon }} {{ credits.toLocaleString() }}
            </span>
          </div>

          <!-- Resource prices grid -->
          <div class="grid grid-cols-1 gap-2">
            <div
              v-for="price in prices"
              :key="price.resourceType"
              class="flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer"
              :class="selectedResource === price.resourceType
                ? 'bg-blue-900/30 border-blue-500'
                : 'bg-gray-800/50 border-gray-700 hover:border-gray-500'"
              @click="selectedResource = price.resourceType; quantity = 1"
            >
              <!-- Resource icon and name -->
              <div class="flex items-center gap-2 flex-1">
                <span class="text-xl">{{ price.icon }}</span>
                <div>
                  <div class="font-medium text-gray-200">{{ price.name }}</div>
                  <div class="text-xs text-gray-500">
                    In this hub: {{ (tradeHubStorage[price.resourceType as keyof ResourceStorage] ?? 0).toLocaleString() }}
                  </div>
                </div>
              </div>

              <!-- Prices -->
              <div class="flex gap-4 text-sm">
                <div class="text-center">
                  <div class="text-gray-500 text-xs">Buy</div>
                  <div class="text-green-400 font-medium">{{ price.buyPrice }}</div>
                </div>
                <div class="text-center">
                  <div class="text-gray-500 text-xs">Sell</div>
                  <div class="text-red-400 font-medium">{{ price.sellPrice }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Trade panel (when resource selected) -->
          <div v-if="selectedResource && selectedPrice" class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-2">
                <span class="text-xl">{{ selectedPrice.icon }}</span>
                <span class="font-medium text-gray-200">{{ selectedPrice.name }}</span>
              </div>

              <!-- Buy/Sell toggle -->
              <div class="flex rounded-lg overflow-hidden border border-gray-600">
                <button
                  class="px-4 py-1.5 text-sm font-medium transition-colors"
                  :class="tradeMode === 'BUY'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'"
                  @click="tradeMode = 'BUY'"
                >
                  Buy
                </button>
                <button
                  class="px-4 py-1.5 text-sm font-medium transition-colors"
                  :class="tradeMode === 'SELL'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'"
                  @click="tradeMode = 'SELL'"
                >
                  Sell
                </button>
              </div>
            </div>

            <!-- Quantity input -->
            <div class="mb-4">
              <label class="block text-sm text-gray-400 mb-2">Quantity</label>
              <div class="flex gap-2">
                <input
                  v-model.number="quantity"
                  type="number"
                  min="1"
                  class="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-200 focus:outline-none focus:border-blue-500"
                />
                <div class="flex gap-1">
                  <button
                    v-for="q in quickQuantities"
                    :key="q"
                    class="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-300"
                    @click="quantity = q"
                  >
                    {{ q }}
                  </button>
                  <button
                    class="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-300 font-medium"
                    @click="tradeMode === 'BUY' ? setMaxBuyQuantity() : setMaxSellQuantity()"
                  >
                    MAX
                  </button>
                </div>
              </div>
            </div>

            <!-- Transaction preview -->
            <div v-if="transactionPreview && quantity > 0" class="mb-4 p-3 bg-gray-900 rounded-lg">
              <div v-if="tradeMode === 'BUY'" class="space-y-1 text-sm">
                <div class="flex justify-between text-gray-400">
                  <span>Base cost ({{ quantity }} x {{ selectedPrice.buyPrice }})</span>
                  <span>{{ transactionPreview.baseCost.toLocaleString() }}</span>
                </div>
                <div class="flex justify-between text-gray-400">
                  <span>Fee (15%)</span>
                  <span>{{ transactionPreview.fee.toLocaleString() }}</span>
                </div>
                <div class="flex justify-between font-medium pt-1 border-t border-gray-700">
                  <span class="text-gray-200">Total cost</span>
                  <span :class="transactionPreview.canAfford ? 'text-green-400' : 'text-red-400'">
                    {{ transactionPreview.total.toLocaleString() }} credits
                  </span>
                </div>
                <div v-if="!transactionPreview.canAfford" class="text-red-400 text-xs mt-1">
                  Insufficient credits
                </div>
              </div>

              <div v-else class="space-y-1 text-sm">
                <div class="flex justify-between text-gray-400">
                  <span>Available to sell</span>
                  <span>{{ transactionPreview.available.toLocaleString() }}</span>
                </div>
                <div class="flex justify-between text-gray-400">
                  <span>Base revenue ({{ quantity }} x {{ selectedPrice.sellPrice }})</span>
                  <span>{{ transactionPreview.baseRevenue.toLocaleString() }}</span>
                </div>
                <div class="flex justify-between text-gray-400">
                  <span>Fee (15%)</span>
                  <span>-{{ transactionPreview.fee.toLocaleString() }}</span>
                </div>
                <div class="flex justify-between font-medium pt-1 border-t border-gray-700">
                  <span class="text-gray-200">You receive</span>
                  <span :class="transactionPreview.canSell ? 'text-green-400' : 'text-red-400'">
                    {{ transactionPreview.net.toLocaleString() }} credits
                  </span>
                </div>
                <div v-if="!transactionPreview.canSell" class="text-red-400 text-xs mt-1">
                  Insufficient {{ selectedPrice.name }}
                </div>
              </div>
            </div>

            <!-- Transaction message -->
            <div
              v-if="transactionMessage"
              class="mb-4 px-3 py-2 rounded text-sm"
              :class="transactionMessage.type === 'success'
                ? 'bg-green-900/30 text-green-300 border border-green-700/50'
                : 'bg-red-900/30 text-red-300 border border-red-700/50'"
            >
              {{ transactionMessage.text }}
            </div>

            <!-- Execute button -->
            <button
              :disabled="!canExecute || transactionLoading"
              class="w-full py-2.5 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              :class="tradeMode === 'BUY'
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'"
              @click="executeTransaction"
            >
              <span v-if="transactionLoading">Processing...</span>
              <span v-else>{{ tradeMode === 'BUY' ? 'Buy' : 'Sell' }} {{ selectedPrice.name }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
