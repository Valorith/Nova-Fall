import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

let toastId = 0;

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([]);

  function show(message: string, type: ToastType = 'info', duration = 4000) {
    const id = `toast-${++toastId}`;
    const toast: Toast = { id, message, type, duration };

    toasts.value.push(toast);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        remove(id);
      }, duration);
    }

    return id;
  }

  function success(message: string, duration?: number) {
    return show(message, 'success', duration);
  }

  function error(message: string, duration?: number) {
    return show(message, 'error', duration ?? 5000);
  }

  function warning(message: string, duration?: number) {
    return show(message, 'warning', duration);
  }

  function info(message: string, duration?: number) {
    return show(message, 'info', duration);
  }

  function remove(id: string) {
    const index = toasts.value.findIndex(t => t.id === id);
    if (index !== -1) {
      toasts.value.splice(index, 1);
    }
  }

  function clear() {
    toasts.value = [];
  }

  return {
    toasts,
    show,
    success,
    error,
    warning,
    info,
    remove,
    clear,
  };
});
