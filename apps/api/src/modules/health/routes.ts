import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/health/detailed', async () => {
    const checks = {
      database: false,
      redis: false,
    };

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      // Database not available
    }

    try {
      await redis.ping();
      checks.redis = true;
    } catch {
      // Redis not available
    }

    const allHealthy = Object.values(checks).every(Boolean);

    return {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    };
  });
}
