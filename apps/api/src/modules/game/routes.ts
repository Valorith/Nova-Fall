import type { FastifyInstance } from 'fastify';
import { getGameStatus } from './service.js';

export async function gameRoutes(app: FastifyInstance) {
  // Get current game timing status (upkeep schedule)
  app.get('/game/status', async () => {
    return getGameStatus();
  });
}
