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

// Market API
export interface MarketPriceInfo {
  resourceType: string;
  name: string;
  icon: string;
  buyPrice: number;
  sellPrice: number;
  transactionFee: number;
}

export interface BuyResourceRequest {
  nodeId: string; // Trade Hub node to receive resources
  resourceType: string;
  quantity: number;
}

export interface SellResourceRequest {
  nodeId: string; // Trade Hub node to sell resources from
  resourceType: string;
  quantity: number;
}

export interface BuyTransactionResponse {
  success: boolean;
  resourceType: string;
  quantity: number;
  baseCost: number;
  fee: number;
  totalCost: number;
  creditsRemaining: number;
  resourceBalance: number;
}

export interface SellTransactionResponse {
  success: boolean;
  resourceType: string;
  quantity: number;
  baseRevenue: number;
  fee: number;
  netRevenue: number;
  creditsBalance: number;
  resourceRemaining: number;
}

export const marketApi = {
  getPrices: () => api.get<{ prices: MarketPriceInfo[] }>('/market/prices'),
  getPrice: (resourceType: string) => api.get<{ price: MarketPriceInfo }>(`/market/prices/${resourceType}`),
  buy: (data: BuyResourceRequest) => api.post<BuyTransactionResponse>('/market/buy', data),
  sell: (data: SellResourceRequest) => api.post<SellTransactionResponse>('/market/sell', data),
};

// Transfers API
export interface TransferResponse {
  id: string;
  sourceNodeId: string;
  destNodeId: string;
  resources: Record<string, number>;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  completesAt: string;
}

export interface CreateTransferRequest {
  sourceNodeId: string;
  destNodeId: string;
  resources: Record<string, number>;
}

export const transfersApi = {
  getAll: () => api.get<{ transfers: TransferResponse[] }>('/transfers'),
  create: (data: CreateTransferRequest) => api.post<{ transfer: TransferResponse; message: string }>('/transfers', data),
  cancel: (id: string) => api.delete<{ transfer: TransferResponse; message: string }>(`/transfers/${id}`),
};

// Blueprints API
import type {
  Blueprint,
  BlueprintInput,
  BlueprintMaterial,
  BlueprintCategory,
  BlueprintQuality,
  NodeType,
} from '@nova-fall/shared';

export interface BlueprintListQuery {
  category?: BlueprintCategory;
  quality?: BlueprintQuality;
  learned?: 'true' | 'false';
  search?: string;
  limit?: number;
  offset?: number;
}

export interface BlueprintListResponse {
  blueprints: Blueprint[];
  total: number;
  limit: number;
  offset: number;
}

export interface BlueprintStats {
  total: number;
  byCategory: Record<string, number>;
  byQuality: Record<string, number>;
  learned: number;
  default: number;
}

export interface DuplicateBlueprintRequest {
  name?: string;
  quality?: BlueprintQuality;
}

export const blueprintsApi = {
  getAll: (query?: BlueprintListQuery) =>
    api.get<BlueprintListResponse>('/blueprints', { params: query }),
  getById: (id: string) => api.get<Blueprint>(`/blueprints/${id}`),
  getStats: () => api.get<BlueprintStats>('/blueprints/stats'),
  getCategories: () => api.get<{ categories: BlueprintCategory[] }>('/blueprints/categories'),
  getQualities: () => api.get<{ qualities: BlueprintQuality[] }>('/blueprints/qualities'),
  getNodeTypes: () => api.get<{ nodeTypes: NodeType[] }>('/blueprints/node-types'),
  create: (data: BlueprintInput) => api.post<Blueprint>('/blueprints', data),
  update: (id: string, data: Partial<BlueprintInput>) => api.put<Blueprint>(`/blueprints/${id}`, data),
  delete: (id: string) => api.delete(`/blueprints/${id}`),
  duplicate: (id: string, data?: DuplicateBlueprintRequest) =>
    api.post<Blueprint>(`/blueprints/${id}/duplicate`, data),
};

// Items API
import type {
  DbItemDefinition,
  DbItemDefinitionInput,
} from '@nova-fall/shared';
import { DbItemCategory } from '@nova-fall/shared';

export interface ItemDefinitionListQuery {
  category?: DbItemCategory;
  isTradeable?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ItemDefinitionListResponse {
  items: DbItemDefinition[];
  total: number;
  limit: number;
  offset: number;
}

// Export aliased type for convenience
export type ItemDefinition = DbItemDefinition;
export type ItemDefinitionInput = DbItemDefinitionInput;

export interface ItemDefinitionStats {
  total: number;
  byCategory: Record<string, number>;
  tradeable: number;
}

export interface SeedResult {
  message: string;
  created: string[];
  skipped: string[];
}

export const itemsApi = {
  getAll: (query?: ItemDefinitionListQuery) =>
    api.get<ItemDefinitionListResponse>('/items', { params: query }),
  getById: (id: string) => api.get<DbItemDefinition>(`/items/${id}`),
  getStats: () => api.get<ItemDefinitionStats>('/items/stats'),
  getCategories: () => api.get<{ categories: DbItemCategory[] }>('/items/categories'),
  create: (data: DbItemDefinitionInput) => api.post<DbItemDefinition>('/items', data),
  update: (id: string, data: Partial<DbItemDefinitionInput>) =>
    api.put<DbItemDefinition>(`/items/${id}`, data),
  delete: (id: string) => api.delete(`/items/${id}`),
  duplicate: (id: string, newItemId?: string) =>
    api.post<DbItemDefinition>(`/items/${id}/duplicate`, { itemId: newItemId }),
  seed: () => api.post<SeedResult>('/items/seed'),
};

// Uploads API
export interface UploadIconRequest {
  data: string; // Base64-encoded image data
  filename: string; // Original filename for extension detection
}

export interface UploadIconResponse {
  success: boolean;
  filename: string;
  url: string;
  originalName: string;
  size: number;
}

export interface IconInfo {
  filename: string;
  url: string;
  size: number;
  createdAt: string;
}

export const uploadsApi = {
  uploadIcon: (data: UploadIconRequest) => api.post<UploadIconResponse>('/uploads/icons', data),
  getIcon: (filename: string) => api.get(`/uploads/icons/${filename}`, { responseType: 'blob' }),
  deleteIcon: (filename: string) => api.delete(`/uploads/icons/${filename}`),
  listIcons: () => api.get<{ icons: IconInfo[] }>('/uploads/icons'),
};

// Re-export shared types for convenience
export type { Blueprint, BlueprintInput, BlueprintMaterial, BlueprintCategory, BlueprintQuality };
