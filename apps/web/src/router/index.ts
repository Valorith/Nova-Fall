import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: () => import('@/views/AuthCallbackView.vue'),
  },
  {
    path: '/game',
    name: 'game',
    component: () => import('@/views/GameView.vue'),
    meta: { requiresAuth: true },
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore();

  // Initialize auth state if not done
  if (!authStore.isInitialized) {
    await authStore.initialize();
  }

  // Skip auth callback route
  if (to.name === 'auth-callback') {
    return next();
  }

  // Redirect authenticated users away from guest-only pages
  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return next({ name: 'game' });
  }

  // Redirect unauthenticated users to login
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next({ name: 'login' });
  }

  next();
});

export default router;
