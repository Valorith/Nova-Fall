import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../../lib/jwt.js';
import { AppError } from '../../plugins/error-handler.js';
import { prisma } from '../../lib/prisma.js';
import { createTransfer, getPlayerTransfers, cancelTransfer } from './service.js';
import type { CreateTransferRequest } from './types.js';

interface AuthenticatedRequest extends FastifyRequest {
  userId: string;
  playerId?: string;
  sessionPlayerId?: string;
  gameSessionId?: string;
}

export async function transferRoutes(app: FastifyInstance) {
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

  /**
   * GET /transfers
   * List all pending transfers for the current player in their active session
   */
  app.get('/transfers', {
    preHandler: [requireAuth, requireActiveSession],
  }, async (request) => {
    const req = request as AuthenticatedRequest;

    if (!req.playerId || !req.gameSessionId) {
      throw AppError.badRequest('Session context required');
    }

    const transfers = await getPlayerTransfers(req.playerId, req.gameSessionId);
    return { transfers };
  });

  /**
   * POST /transfers
   * Create a new resource transfer between adjacent owned nodes
   */
  app.post('/transfers', {
    preHandler: [requireAuth, requireActiveSession],
  }, async (request) => {
    const req = request as AuthenticatedRequest;
    const body = request.body as CreateTransferRequest;

    if (!req.playerId || !req.gameSessionId) {
      throw AppError.badRequest('Session context required');
    }

    // Validate request body
    if (!body.sourceNodeId || !body.destNodeId || !body.resources) {
      throw AppError.badRequest('Missing sourceNodeId, destNodeId, or resources');
    }

    const result = await createTransfer(req.playerId, req.gameSessionId, body);

    if ('error' in result) {
      throw AppError.badRequest(result.error);
    }

    return {
      transfer: result.transfer,
      message: 'Transfer initiated successfully',
    };
  });

  /**
   * DELETE /transfers/:id
   * Cancel a pending transfer and return resources to source node
   */
  app.delete('/transfers/:id', {
    preHandler: [requireAuth, requireActiveSession],
  }, async (request) => {
    const req = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };

    if (!req.playerId) {
      throw AppError.badRequest('Player context required');
    }

    const result = await cancelTransfer(req.playerId, id);

    if ('error' in result) {
      throw AppError.badRequest(result.error);
    }

    return {
      transfer: result.transfer,
      message: 'Transfer cancelled, resources returned to source',
    };
  });
}
