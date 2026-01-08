import type { ResourceStorage } from '@nova-fall/shared';

// Transfer duration factors:
// - 1 minute per node in the path (minimum/distance factor)
// - 1 second per resource unit (quantity factor)
export const TRANSFER_TIME_PER_NODE_MS = 60 * 1000;
export const TRANSFER_TIME_PER_RESOURCE_MS = 1000;

export interface CreateTransferRequest {
  sourceNodeId: string;
  destNodeId: string;
  resources: Partial<ResourceStorage>;
}

export interface CancelTransferRequest {
  transferId: string;
}

export interface TransferResponse {
  id: string;
  sourceNodeId: string;
  destNodeId: string;
  resources: ResourceStorage;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  completesAt: string;
}

export interface TransferListResponse {
  transfers: TransferResponse[];
}

export interface CreateTransferResponse {
  transfer: TransferResponse;
  message: string;
}

export interface CancelTransferResponse {
  transfer: TransferResponse;
  message: string;
}
