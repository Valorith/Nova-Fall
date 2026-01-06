import { vi } from 'vitest';

// Mock Redis to avoid connection issues during tests
vi.mock('../lib/redis.js', () => ({
  redis: {
    publish: vi.fn().mockResolvedValue(1),
    subscribe: vi.fn(),
    on: vi.fn(),
    quit: vi.fn(),
  },
}));

// Mock events to avoid Redis dependency
vi.mock('../lib/events.js', () => ({
  publishNodeClaimed: vi.fn().mockResolvedValue(undefined),
  publishNodeAbandoned: vi.fn().mockResolvedValue(undefined),
}));
