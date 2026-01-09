import type { ResourceStorage } from '@nova-fall/shared';

// Transfer duration factors:
// - 1 minute per node in the path (minimum/distance factor)
// - 1 second per resource unit (quantity factor)
export const TRANSFER_TIME_PER_NODE_MS = 60 * 1000;
export const TRANSFER_TIME_PER_RESOURCE_MS = 1000;

// Job tick interval - transfers align completion to this interval
export const TRANSFER_JOB_INTERVAL_MS = 30 * 1000;

/**
 * Calculate the next tick time after a given timestamp using epoch-based alignment.
 * Both API and worker use this same formula, ensuring they always agree on tick boundaries
 * regardless of clock drift or when services started.
 */
export function getNextTickAfter(timestamp: number): number {
  const remainder = timestamp % TRANSFER_JOB_INTERVAL_MS;
  if (remainder === 0) {
    // Exactly on a tick boundary - return next tick
    return timestamp + TRANSFER_JOB_INTERVAL_MS;
  }
  return timestamp + (TRANSFER_JOB_INTERVAL_MS - remainder);
}

/**
 * Get the current tick boundary (the tick that is currently active or just passed)
 */
export function getCurrentTick(now: number): number {
  return now - (now % TRANSFER_JOB_INTERVAL_MS);
}

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
