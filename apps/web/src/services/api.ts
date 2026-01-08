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

// Nodes API
export const nodesApi = {
  getAll: () => api.get('/nodes'),
  getById: (id: string) => api.get(`/nodes/${id}`),
  claim: (id: string) => api.post(`/nodes/${id}/claim`),
  abandon: (id: string) => api.post(`/nodes/${id}/abandon`),
};

// Sessions API
export interface CreateSessionRequest {
  name: string;
  gameType: 'KING_OF_THE_HILL' | 'DOMINATION';
}

export interface SessionListQuery {
  status?: 'LOBBY' | 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  gameType?: 'KING_OF_THE_HILL' | 'DOMINATION';
}

export interface AddBotRequest {
  name?: string;
  difficulty?: 'EASY' | 'NORMAL' | 'HARD';
}

export const sessionsApi = {
  getAll: (query?: SessionListQuery) => api.get('/sessions', { params: query }),
  getById: (id: string) => api.get(`/sessions/${id}`),
  getMy: () => api.get('/sessions/my'),
  getMyResources: () => api.get('/sessions/my/resources'),
  updateMyResources: (resources: Record<string, number>) => api.put('/sessions/my/resources', { resources }),
  create: (data: CreateSessionRequest) => api.post('/sessions', data),
  join: (id: string) => api.post(`/sessions/${id}/join`),
  spectate: (id: string) => api.post(`/sessions/${id}/spectate`),
  leave: (id: string) => api.post(`/sessions/${id}/leave`),
  start: (id: string) => api.post(`/sessions/${id}/start`),
  end: (id: string) => api.post(`/sessions/${id}/end`),
  addBot: (id: string, data?: AddBotRequest) => api.post(`/sessions/${id}/add-bot`, data),
  removeBot: (id: string, botId: string) => api.post(`/sessions/${id}/remove-bot/${botId}`),
};

// Game API
export interface GameStatusResponse {
  nextUpkeepAt: number;
  upkeepInterval: number;
}

export const gameApi = {
  getStatus: () => api.get<GameStatusResponse>('/game/status'),
};
