// Crafting queue types for the unified crafting system

import type { ItemStorage } from '../config/items.js';

/**
 * A single item in a node's crafting queue.
 * Crafting happens in "runs" - each run produces 1 item.
 */
export interface CraftingQueueItem {
  /** Unique ID for this queue entry */
  id: string;
  /** Reference to Blueprint ID */
  blueprintId: string;
  /** Primary output item ID (for display purposes) */
  outputItemId?: string;
  /** Total items to craft in this batch */
  quantity: number;
  /** Number of runs already completed (items produced) */
  completedRuns: number;
  /** Time per single run in milliseconds */
  timePerRun: number;
  /** Timestamp when current run started (ms since epoch) */
  startedAt: number;
  /** Timestamp when current run completes (ms since epoch) */
  completesAt: number;
}

/**
 * A node's crafting queue - array of queue items.
 * First item is the active craft, rest are queued.
 */
export type CraftingQueue = CraftingQueueItem[];

/**
 * Request payload for starting a craft.
 */
export interface StartCraftRequest {
  blueprintId: string;
  quantity: number;
}

/**
 * Response when crafting is started.
 */
export interface StartCraftResponse {
  queue: CraftingQueue;
  storage: ItemStorage;
}

/**
 * Response when craft is cancelled.
 */
export interface CancelCraftResponse {
  queue: CraftingQueue;
  storage: ItemStorage;
  refunded: ItemStorage;
}

/**
 * Crafting completion event payload.
 */
export interface CraftingCompletedEvent {
  nodeId: string;
  queueItemId: string;
  blueprintId: string;
  quantity: number;
  outputs: ItemStorage;
  storage: ItemStorage;
}

/**
 * Crafting started event payload.
 */
export interface CraftingStartedEvent {
  nodeId: string;
  queueItem: CraftingQueueItem;
  storage: ItemStorage;
}

/**
 * Crafting cancelled event payload.
 */
export interface CraftingCancelledEvent {
  nodeId: string;
  queueItemId: string;
  refunded: ItemStorage;
  storage: ItemStorage;
}

/**
 * Calculate progress percentage for the current run of a crafting queue item.
 * @param item - The crafting queue item
 * @param now - Current timestamp in ms (defaults to Date.now())
 * @returns Progress percentage (0-100) for the current run
 */
export function getCraftingProgress(item: CraftingQueueItem, now: number = Date.now()): number {
  const total = item.completesAt - item.startedAt;
  if (total <= 0) return 100;
  const elapsed = now - item.startedAt;
  return Math.min(100, Math.max(0, Math.floor((elapsed / total) * 100)));
}

/**
 * Calculate overall progress percentage across all runs.
 * @param item - The crafting queue item
 * @param now - Current timestamp in ms (defaults to Date.now())
 * @returns Progress percentage (0-100) for total completion
 */
export function getCraftingOverallProgress(item: CraftingQueueItem, now: number = Date.now()): number {
  if (item.quantity <= 0) return 100;
  const completedProgress = (item.completedRuns / item.quantity) * 100;
  const currentRunProgress = getCraftingProgress(item, now) / item.quantity;
  return Math.min(100, Math.floor(completedProgress + currentRunProgress));
}

/**
 * Get remaining runs (items still to be crafted).
 * @param item - The crafting queue item
 * @returns Number of remaining runs including current
 */
export function getRemainingRuns(item: CraftingQueueItem): number {
  return Math.max(0, item.quantity - item.completedRuns);
}

/**
 * Check if a crafting queue item is complete.
 * @param item - The crafting queue item
 * @param now - Current timestamp in ms (defaults to Date.now())
 * @returns True if the item has completed
 */
export function isCraftingComplete(item: CraftingQueueItem, now: number = Date.now()): boolean {
  return now >= item.completesAt;
}

/**
 * Get remaining time for current run in milliseconds.
 * @param item - The crafting queue item
 * @param now - Current timestamp in ms (defaults to Date.now())
 * @returns Remaining time in ms for current run, or 0 if complete
 */
export function getCraftingRemainingTime(item: CraftingQueueItem, now: number = Date.now()): number {
  return Math.max(0, item.completesAt - now);
}

/**
 * Get total remaining time for all runs in milliseconds.
 * @param item - The crafting queue item
 * @param now - Current timestamp in ms (defaults to Date.now())
 * @returns Total remaining time in ms for all remaining runs
 */
export function getCraftingTotalRemainingTime(item: CraftingQueueItem, now: number = Date.now()): number {
  const currentRunRemaining = getCraftingRemainingTime(item, now);
  const futureRuns = Math.max(0, item.quantity - item.completedRuns - 1);
  return currentRunRemaining + (futureRuns * item.timePerRun);
}
