<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  isOpen: boolean;
  itemName: string;
  itemIcon?: string | null;
  itemColor?: string;
  unitPrice: number;
  maxQuantity?: number;
  playerCredits: number;
}>();

const emit = defineEmits<{
  (e: 'confirm', quantity: number): void;
  (e: 'cancel'): void;
}>();

const quantity = ref(1);
const numberInput = ref<HTMLInputElement | null>(null);

// Calculate max affordable quantity
const maxAffordable = computed(() => {
  if (props.unitPrice <= 0) return props.maxQuantity ?? 999;
  const affordable = Math.floor(props.playerCredits / props.unitPrice);
  return props.maxQuantity ? Math.min(affordable, props.maxQuantity) : affordable;
});

// Total cost for current quantity
const totalCost = computed(() => quantity.value * props.unitPrice);

// Can afford current selection
const canAfford = computed(() => totalCost.value <= props.playerCredits);

// Clamp quantity to valid range
function clampQuantity(val: number): number {
  return Math.max(1, Math.min(val, maxAffordable.value));
}

// Update quantity from slider
function onSliderChange(event: Event) {
  const target = event.target as HTMLInputElement;
  quantity.value = clampQuantity(parseInt(target.value, 10) || 1);
}

// Update quantity from number input
function onNumberChange(event: Event) {
  const target = event.target as HTMLInputElement;
  quantity.value = clampQuantity(parseInt(target.value, 10) || 1);
}

// Handle confirm
function handleConfirm() {
  if (canAfford.value && quantity.value >= 1) {
    emit('confirm', quantity.value);
  }
}

// Handle cancel
function handleCancel() {
  emit('cancel');
}

// Handle keydown for Enter key
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    handleConfirm();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    handleCancel();
  }
}

// Reset quantity when modal opens
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    quantity.value = 1;
    // Focus the number input when modal opens
    setTimeout(() => {
      numberInput.value?.focus();
      numberInput.value?.select();
    }, 50);
  }
});

// Global keydown listener for escape
function globalKeydown(event: KeyboardEvent) {
  if (props.isOpen && event.key === 'Escape') {
    event.preventDefault();
    handleCancel();
  }
}

onMounted(() => {
  document.addEventListener('keydown', globalKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', globalKeydown);
});

// Check if icon is a URL/path or emoji
function isIconUrl(icon: string | null | undefined): boolean {
  if (!icon) return false;
  return icon.startsWith('/') || icon.startsWith('http');
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click.self="handleCancel">
        <div class="modal-container" @keydown="handleKeydown">
          <div class="modal-header">
            <h3>Purchase Quantity</h3>
            <button class="close-btn" @click="handleCancel">&times;</button>
          </div>

          <div class="modal-body">
            <!-- Item info -->
            <div class="item-info">
              <div
                class="item-icon"
                :style="{ backgroundColor: (itemColor || '#888') + '20', color: itemColor || '#888' }"
              >
                <img
                  v-if="isIconUrl(itemIcon)"
                  :src="itemIcon!"
                  :alt="itemName"
                  class="icon-img"
                />
                <span v-else>{{ itemIcon || '📦' }}</span>
              </div>
              <div class="item-details">
                <span class="item-name">{{ itemName }}</span>
                <span class="item-price">{{ unitPrice }} credits each</span>
              </div>
            </div>

            <!-- Quantity controls -->
            <div class="quantity-controls">
              <label class="quantity-label">Quantity</label>

              <!-- Slider -->
              <div class="slider-row">
                <input
                  type="range"
                  :min="1"
                  :max="Math.max(1, maxAffordable)"
                  :value="quantity"
                  class="quantity-slider"
                  :disabled="maxAffordable < 1"
                  @input="onSliderChange"
                />
              </div>

              <!-- Number input with min/max buttons -->
              <div class="number-row">
                <button
                  class="qty-btn"
                  :disabled="quantity <= 1"
                  @click="quantity = clampQuantity(quantity - 1)"
                >
                  -
                </button>
                <input
                  ref="numberInput"
                  type="number"
                  :min="1"
                  :max="maxAffordable"
                  :value="quantity"
                  class="quantity-input"
                  :disabled="maxAffordable < 1"
                  @input="onNumberChange"
                  @keydown.enter.prevent="handleConfirm"
                />
                <button
                  class="qty-btn"
                  :disabled="quantity >= maxAffordable"
                  @click="quantity = clampQuantity(quantity + 1)"
                >
                  +
                </button>
                <button
                  class="max-btn"
                  :disabled="maxAffordable < 1"
                  @click="quantity = maxAffordable"
                >
                  Max
                </button>
              </div>
            </div>

            <!-- Cost summary -->
            <div class="cost-summary">
              <div class="cost-row">
                <span class="cost-label">Total Cost:</span>
                <span class="cost-value" :class="{ 'cannot-afford': !canAfford }">
                  {{ totalCost.toLocaleString() }} credits
                </span>
              </div>
              <div class="balance-row">
                <span class="balance-label">Your Balance:</span>
                <span class="balance-value">{{ playerCredits.toLocaleString() }} credits</span>
              </div>
              <div v-if="!canAfford" class="warning-row">
                Not enough credits!
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-cancel" @click="handleCancel">
              Cancel
            </button>
            <button
              class="btn btn-confirm"
              :disabled="!canAfford || quantity < 1"
              @click="handleConfirm"
            >
              Purchase ({{ quantity }})
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  background: #1a1f2e;
  border: 1px solid #2a3040;
  border-radius: 16px;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #2a3040;
}

.modal-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #e5e5e5;
}

.close-btn {
  background: none;
  border: none;
  color: #6b7280;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: #e5e5e5;
}

.modal-body {
  padding: 24px;
}

.item-info {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  background: #0f1419;
  border-radius: 10px;
  margin-bottom: 24px;
}

.item-icon {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 28px;
  flex-shrink: 0;
}

.icon-img {
  width: 42px;
  height: 42px;
  object-fit: contain;
}

.item-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-name {
  font-weight: 600;
  font-size: 16px;
  color: #e5e5e5;
}

.item-price {
  font-size: 14px;
  color: #9ca3af;
}

.quantity-controls {
  margin-bottom: 24px;
}

.quantity-label {
  display: block;
  font-size: 13px;
  color: #9ca3af;
  text-transform: uppercase;
  margin-bottom: 14px;
}

.slider-row {
  margin-bottom: 14px;
}

.quantity-slider {
  width: 100%;
  height: 10px;
  -webkit-appearance: none;
  appearance: none;
  background: #0f1419;
  border-radius: 5px;
  outline: none;
}

.quantity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 24px;
  background: #eab308;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid #1a1f2e;
}

.quantity-slider::-moz-range-thumb {
  width: 24px;
  height: 24px;
  background: #eab308;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid #1a1f2e;
}

.quantity-slider:disabled {
  opacity: 0.5;
}

.number-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.qty-btn {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #374151;
  border: 1px solid #4b5563;
  border-radius: 8px;
  color: #e5e5e5;
  font-size: 20px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.qty-btn:hover:not(:disabled) {
  background: #4b5563;
}

.qty-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.quantity-input {
  flex: 1;
  height: 42px;
  padding: 0 14px;
  background: #0f1419;
  border: 1px solid #2a3040;
  border-radius: 8px;
  color: #e5e5e5;
  font-size: 18px;
  text-align: center;
  -moz-appearance: textfield;
}

.quantity-input::-webkit-outer-spin-button,
.quantity-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.quantity-input:focus {
  outline: none;
  border-color: #eab308;
}

.quantity-input:disabled {
  opacity: 0.5;
}

.max-btn {
  padding: 0 16px;
  height: 42px;
  background: #374151;
  border: 1px solid #4b5563;
  border-radius: 8px;
  color: #9ca3af;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s;
}

.max-btn:hover:not(:disabled) {
  background: #4b5563;
  color: #e5e5e5;
}

.max-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.cost-summary {
  padding: 16px;
  background: #0f1419;
  border-radius: 10px;
}

.cost-row,
.balance-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
}

.cost-label {
  font-size: 15px;
  color: #9ca3af;
}

.cost-value {
  font-weight: 600;
  font-size: 16px;
  color: #eab308;
}

.cost-value.cannot-afford {
  color: #ef4444;
}

.balance-label {
  font-size: 14px;
  color: #6b7280;
}

.balance-value {
  font-size: 14px;
  color: #6b7280;
}

.warning-row {
  margin-top: 10px;
  padding: 10px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 6px;
  color: #ef4444;
  font-size: 14px;
  text-align: center;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 14px;
  padding: 20px 24px;
  border-top: 1px solid #2a3040;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-cancel {
  background: #374151;
  color: #e5e5e5;
}

.btn-cancel:hover {
  background: #4b5563;
}

.btn-confirm {
  background: #eab308;
  color: #000;
}

.btn-confirm:hover:not(:disabled) {
  background: #fbbf24;
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Transition animations */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95);
}
</style>
