/**
 * Transfer system configuration
 *
 * Transfer duration formula:
 * - 1 minute per node in the path (distance factor)
 * - 1 second per resource unit (quantity factor)
 *
 * Example: Transferring 100 iron to a node 2 hops away
 * = (2 * 60000ms) + (100 * 1000ms) = 120000 + 100000 = 220000ms = 3m 40s
 */

// Time per node in the path (1 minute = 60,000ms)
export const TRANSFER_TIME_PER_NODE_MS = 60 * 1000;

// Time per resource unit (1 second = 1,000ms)
export const TRANSFER_TIME_PER_RESOURCE_MS = 1000;

// Job tick interval - transfers align completion to this interval (30 seconds)
export const TRANSFER_JOB_INTERVAL_MS = 30 * 1000;

/**
 * Calculate estimated transfer duration in milliseconds
 * @param distance - Number of nodes in the path (1 = adjacent)
 * @param totalQuantity - Total number of resource units being transferred
 * @returns Duration in milliseconds
 */
export function calculateTransferDuration(distance: number, totalQuantity: number): number {
  const distanceTimeMs = distance * TRANSFER_TIME_PER_NODE_MS;
  const quantityTimeMs = totalQuantity * TRANSFER_TIME_PER_RESOURCE_MS;
  return distanceTimeMs + quantityTimeMs;
}

/**
 * Format a duration in milliseconds to a human-readable string
 * @param durationMs - Duration in milliseconds
 * @returns Formatted string like "2m 30s" or "45s"
 */
export function formatTransferDuration(durationMs: number): string {
  const totalSeconds = Math.ceil(durationMs / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}
