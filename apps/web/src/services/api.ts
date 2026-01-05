import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { useAuthStore } from '@/stores/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const authStore = useAuthStore();
  if (authStore.accessToken) {
    config.headers.Authorization = `Bearer ${authStore.accessToken}`;
  }
  return config;
});

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;
    const authStore = useAuthStore();

    // If 401 and we have a refresh token, try to refresh
    if (
      error.response?.status === 401 &&
      authStore.refreshToken &&
      originalRequest &&
      !(originalRequest as { _retry?: boolean })._retry
    ) {
      (originalRequest as { _retry?: boolean })._retry = true;

      try {
        const response = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken: authStore.refreshToken,
        });

        const { accessToken, refreshToken } = response.data;
        authStore.setTokens(accessToken, refreshToken);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch {
        // Refresh failed, logout
        authStore.logout();
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  updateUsername: (username: string) => api.patch('/auth/username', { username }),
};
