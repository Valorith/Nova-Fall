import Redis from 'ioredis';
import { config } from '../config/index.js';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

// Publisher client for pub/sub messages
export const publisherRedis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

publisherRedis.on('error', (err) => {
  console.error('Redis publisher connection error:', err);
});

/**
 * Schedule a crafting job to run at a specific time.
 * The worker will pick this up and create a delayed BullMQ job.
 */
export async function scheduleCraftingJob(nodeId: string, completesAt: number): Promise<void> {
  const delay = Math.max(0, completesAt - Date.now());
  await publisherRedis.publish('crafting:schedule', JSON.stringify({ nodeId, delay, completesAt }));
}
