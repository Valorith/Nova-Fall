import Redis from 'ioredis';
import { config } from '../config.js';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

// Separate connection for publishing events (BullMQ uses the main one)
export const publisherRedis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
});

publisherRedis.on('error', (err) => {
  console.error('Publisher Redis connection error:', err);
});
