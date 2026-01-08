import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../../lib/jwt.js';
import { AppError } from '../../plugins/error-handler.js';
import { prisma } from '../../lib/prisma.js';
import * as nodeService from './service.js';
import type { NodeListQuery } from './types.js';

interface AuthenticatedRequest extends FastifyRequest {
  userId: string;
  playerId?: string;
  sessionPlayerId?: string;
  gameSessionId?: string;
}

export async function nodeRoutes(app: FastifyInstance) {
  // Middleware to verify JWT token (optional auth)
  const optionalAuth = async (request: FastifyRequest, _reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return; // No auth, continue as guest
    }

    const token = authHeader.substring(7);
    const payload = await verifyAccessToken(token);

    if (payload?.sub) {
      (request as AuthenticatedRequest).userId = payload.sub;
    }
  };

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

    (request as AuthenticatedRequest).userId = payload.sub;
  };

  // Middleware to require active game session
  const requireActiveSession = async (request: FastifyRequest, _reply: FastifyReply) => {
    const req = request as AuthenticatedRequest;
    if (!req.userId) {
      throw AppError.unauthorized('Authentication required');
    }

    // Get player and their active session
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        player: {
          include: {
            gameSessions: {
              where: {
                gameSession: {
                  status: 'ACTIVE',
                },
              },
              include: {
                gameSession: true,
              },
            },
          },
        },
      },
    });

    if (!user?.player) {
      throw AppError.badRequest('No player profile found');
    }

    req.playerId = user.player.id;

    // Find active session (ACTIVE status, not LOBBY/COMPLETED/ABANDONED)
    const activeSessionPlayer = user.player.gameSessions.find(
      (gsp) => gsp.gameSession.status === 'ACTIVE'
    );

    if (!activeSessionPlayer) {
      throw AppError.badRequest('No active game session. Join or start a game first.');
    }

    req.sessionPlayerId = activeSessionPlayer.id;
    req.gameSessionId = activeSessionPlayer.gameSessionId;
  };

  // GET /nodes - List all nodes (with optional pagination)
  // Query param: sessionId (required for session-scoped nodes)
  app.get('/nodes', {
    preHandler: optionalAuth,
  }, async (request) => {
    const query = request.query as NodeListQuery;

    // If no pagination specified, return all nodes for initial map load
    if (!query.page && !query.pageSize) {
      const nodes = await nodeService.getAllNodes(query.sessionId);
      return { nodes };
    }

    return nodeService.getNodes(query);
  });

  // GET /nodes/connections - Get all connections (for map rendering)
  app.get('/nodes/connections', async () => {
    const connections = await nodeService.getAllConnections();
    return { connections };
  });

  // GET /nodes/:id - Get node details
  app.get('/nodes/:id', {
    preHandler: optionalAuth,
  }, async (request) => {
    const { id } = request.params as { id: string };
    const node = await nodeService.getNodeById(id);

    if (!node) {
      throw AppError.notFound('Node not found');
    }

    return { node };
  });

  // GET /nodes/:id/connections - Get node connections
  app.get('/nodes/:id/connections', async (request) => {
    const { id } = request.params as { id: string };
    const connections = await nodeService.getNodeConnections(id);
    return { connections };
  });

  // POST /nodes/:id/claim - Claim a neutral node
  // Requires active game session
  app.post('/nodes/:id/claim', {
    preHandler: [requireAuth, requireActiveSession],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const req = request as AuthenticatedRequest;

    if (!req.playerId || !req.gameSessionId || !req.sessionPlayerId) {
      throw AppError.badRequest('Session context required');
    }

    const result = await nodeService.claimNode(
      id,
      req.playerId,
      req.gameSessionId,
      req.sessionPlayerId
    );

    if (!result.success) {
      throw AppError.badRequest(result.error ?? 'Failed to claim node');
    }

    return { node: result.node, resources: result.resources };
  });

  // POST /nodes/:id/abandon - Abandon an owned node
  // Requires active game session
  app.post('/nodes/:id/abandon', {
    preHandler: [requireAuth, requireActiveSession],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const req = request as AuthenticatedRequest;

    if (!req.playerId || !req.gameSessionId || !req.sessionPlayerId) {
      throw AppError.badRequest('Session context required');
    }

    const result = await nodeService.abandonNode(
      id,
      req.playerId,
      req.gameSessionId,
      req.sessionPlayerId
    );

    if (!result.success) {
      throw AppError.badRequest(result.error ?? 'Failed to abandon node');
    }

    return { success: true };
  });
}
