import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../../lib/jwt.js';
import { AppError } from '../../plugins/error-handler.js';
import { prisma } from '../../lib/prisma.js';
import * as sessionService from './service.js';
import type { CreateSessionRequest, SessionListQuery } from './types.js';
import type { GameType } from '@prisma/client';

export async function sessionRoutes(app: FastifyInstance) {
  // Middleware to require authentication
  const requireAuth = async (request: FastifyRequest, _reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw AppError.unauthorized('Missing authorization header');
    }

    const token = authHeader.substring(7);
    const payload = await verifyAccessToken(token);

    if (!payload?.sub) {
      throw AppError.unauthorized('Invalid or expired token');
    }

    (request as FastifyRequest & { userId: string }).userId = payload.sub;
  };

  // Helper to get player from user
  const getPlayer = async (userId: string) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { player: true },
    });

    if (!user?.player) {
      throw AppError.badRequest('No player profile found');
    }

    return user.player;
  };

  // GET /sessions - List sessions (for lobby)
  app.get('/sessions', {
    preHandler: requireAuth,
  }, async (request) => {
    const query = request.query as SessionListQuery;
    const sessions = await sessionService.getSessions(query);
    return { sessions };
  });

  // GET /sessions/my - Get user's active session
  app.get('/sessions/my', {
    preHandler: requireAuth,
  }, async (request) => {
    const userId = (request as FastifyRequest & { userId: string }).userId;
    const player = await getPlayer(userId);
    const session = await sessionService.getPlayerActiveSession(player.id);
    return { session };
  });

  // GET /sessions/:id - Get session details
  app.get('/sessions/:id', {
    preHandler: requireAuth,
  }, async (request) => {
    const { id } = request.params as { id: string };
    const session = await sessionService.getSessionById(id);

    if (!session) {
      throw AppError.notFound('Session not found');
    }

    return { session };
  });

  // POST /sessions - Create a new session
  app.post('/sessions', {
    preHandler: requireAuth,
  }, async (request) => {
    const userId = (request as FastifyRequest & { userId: string }).userId;
    const player = await getPlayer(userId);
    const body = request.body as CreateSessionRequest;

    if (!body.name?.trim()) {
      throw AppError.badRequest('Session name is required');
    }

    if (!body.gameType || !['KING_OF_THE_HILL', 'DOMINATION'].includes(body.gameType)) {
      throw AppError.badRequest('Valid game type is required (KING_OF_THE_HILL or DOMINATION)');
    }

    const result = await sessionService.createSession(
      player.id,
      body.name.trim(),
      body.gameType as GameType
    );

    if (!result.success) {
      throw AppError.badRequest(result.error ?? 'Failed to create session');
    }

    return { session: result.session };
  });

  // POST /sessions/:id/join - Join as player
  app.post('/sessions/:id/join', {
    preHandler: requireAuth,
  }, async (request) => {
    const { id } = request.params as { id: string };
    const userId = (request as FastifyRequest & { userId: string }).userId;
    const player = await getPlayer(userId);

    const result = await sessionService.joinSession(id, player.id);

    if (!result.success) {
      throw AppError.badRequest(result.error ?? 'Failed to join session');
    }

    return { session: result.session };
  });

  // POST /sessions/:id/spectate - Join as spectator
  app.post('/sessions/:id/spectate', {
    preHandler: requireAuth,
  }, async (request) => {
    const { id } = request.params as { id: string };
    const userId = (request as FastifyRequest & { userId: string }).userId;
    const player = await getPlayer(userId);

    const result = await sessionService.spectateSession(id, player.id);

    if (!result.success) {
      throw AppError.badRequest(result.error ?? 'Failed to spectate session');
    }

    return { session: result.session };
  });

  // POST /sessions/:id/leave - Leave session
  app.post('/sessions/:id/leave', {
    preHandler: requireAuth,
  }, async (request) => {
    const { id } = request.params as { id: string };
    const userId = (request as FastifyRequest & { userId: string }).userId;
    const player = await getPlayer(userId);

    const result = await sessionService.leaveSession(id, player.id);

    if (!result.success) {
      throw AppError.badRequest(result.error ?? 'Failed to leave session');
    }

    return { success: true };
  });

  // POST /sessions/:id/start - Start the game (creator only)
  app.post('/sessions/:id/start', {
    preHandler: requireAuth,
  }, async (request) => {
    const { id } = request.params as { id: string };
    const userId = (request as FastifyRequest & { userId: string }).userId;
    const player = await getPlayer(userId);

    const result = await sessionService.startSession(id, player.id);

    if (!result.success) {
      throw AppError.badRequest(result.error ?? 'Failed to start session');
    }

    return { session: result.session };
  });
}
