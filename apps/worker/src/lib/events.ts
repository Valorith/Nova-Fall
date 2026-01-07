import { publisherRedis } from './redis.js';

// Event types for real-time updates
export interface UpkeepTickEvent {
  nextUpkeepAt: number; // timestamp
  upkeepInterval: number; // milliseconds (1 hour)
}

// Publish functions
export async function publishNodeUpdate(nodeId: string, changes: Record<string, unknown>): Promise<void> {
  await publisherRedis.publish('node:update', JSON.stringify({ nodeId, changes }));
}

export async function publishUpkeepTick(event: UpkeepTickEvent): Promise<void> {
  await publisherRedis.publish('upkeep:tick', JSON.stringify(event));
}
