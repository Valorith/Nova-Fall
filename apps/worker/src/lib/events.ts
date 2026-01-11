import { publisherRedis } from './redis.js';

// Event types for real-time updates
export interface UpkeepTickEvent {
  nextUpkeepAt: number; // timestamp
  upkeepInterval: number; // milliseconds (1 hour)
}

export interface TransferCompletedEvent {
  transferId: string;
  playerId: string;
  sourceNodeId: string;
  destNodeId: string;
  status: 'COMPLETED' | 'CANCELLED';
  sessionId: string;
  // Updated storage values for immediate UI update (no API call needed)
  sourceStorage?: Record<string, number>;
  destStorage?: Record<string, number>;
}

// Publish functions
export async function publishNodeUpdate(nodeId: string, changes: Record<string, unknown>): Promise<void> {
  await publisherRedis.publish('node:update', JSON.stringify({ nodeId, changes }));
}

export async function publishUpkeepTick(event: UpkeepTickEvent): Promise<void> {
  await publisherRedis.publish('upkeep:tick', JSON.stringify(event));
}

export async function publishTransferCompleted(event: TransferCompletedEvent): Promise<void> {
  await publisherRedis.publish('transfer:completed', JSON.stringify(event));
}

// Crafting events
export interface CraftingQueueItemEvent {
  id: string;
  blueprintId: string;
  outputItemId?: string;
  quantity: number;
  completedRuns: number;
  timePerRun: number;
  startedAt: number;
  completesAt: number;
}

export interface CraftingCompletedEvent {
  nodeId: string;
  queueItemId: string;
  blueprintId: string;
  quantity: number;
  outputs: Record<string, number>;
  storage: Record<string, number>;
  queue: CraftingQueueItemEvent[];
  sessionId: string;
  playerId: string;
}

export async function publishCraftingCompleted(event: CraftingCompletedEvent): Promise<void> {
  await publisherRedis.publish('crafting:completed', JSON.stringify(event));
}
