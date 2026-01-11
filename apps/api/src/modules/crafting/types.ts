import type { Blueprint, CraftingQueue, ItemStorage } from '@nova-fall/shared';

/**
 * Request body for starting a craft.
 */
export interface StartCraftRequestBody {
  blueprintId: string;
  quantity: number;
}

/**
 * Response for get blueprints endpoint.
 */
export interface GetBlueprintsResponse {
  blueprints: Blueprint[];
}

/**
 * Response for get crafting queue endpoint.
 */
export interface GetCraftingQueueResponse {
  queue: CraftingQueue;
}

/**
 * Response for start crafting endpoint.
 */
export interface StartCraftingResponse {
  queue: CraftingQueue;
  storage: ItemStorage;
  message: string;
}

/**
 * Response for cancel craft endpoint.
 */
export interface CancelCraftResponse {
  queue: CraftingQueue;
  storage: ItemStorage;
  refunded: ItemStorage;
  message: string;
}

/**
 * Internal service result types.
 */
export type StartCraftResult =
  | { success: true; queue: CraftingQueue; storage: ItemStorage }
  | { success: false; error: string };

export type CancelCraftResult =
  | { success: true; queue: CraftingQueue; storage: ItemStorage; refunded: ItemStorage }
  | { success: false; error: string };
