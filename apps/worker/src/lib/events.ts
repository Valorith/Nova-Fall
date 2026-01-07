import { publisherRedis } from './redis.js';
import type { ResourceStorage } from '@nova-fall/shared';

// Event types for real-time updates
export interface ResourceUpdateEvent {
  nodeId: string;
  storage: ResourceStorage;
  produced: ResourceStorage;
}

export interface BatchResourceUpdateEvent {
  updates: ResourceUpdateEvent[];
  tick: number;
}

export interface GameTickEvent {
  tick: number;
  tickInterval: number; // milliseconds
  nextTickAt: number; // timestamp
}

export interface UpkeepTickEvent {
  nextUpkeepAt: number; // timestamp
  upkeepInterval: number; // milliseconds (1 hour)
}

// Publish functions
export async function publishResourceUpdates(event: BatchResourceUpdateEvent): Promise<void> {
  await publisherRedis.publish('resources:update', JSON.stringify(event));
}

export async function publishNodeUpdate(nodeId: string, changes: Record<string, unknown>): Promise<void> {
  await publisherRedis.publish('node:update', JSON.stringify({ nodeId, changes }));
}

export async function publishGameTick(event: GameTickEvent): Promise<void> {
  await publisherRedis.publish('game:tick', JSON.stringify(event));
}

export async function publishUpkeepTick(event: UpkeepTickEvent): Promise<void> {
  await publisherRedis.publish('upkeep:tick', JSON.stringify(event));
}
