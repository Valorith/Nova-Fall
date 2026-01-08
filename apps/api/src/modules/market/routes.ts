import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../../lib/jwt.js';
import { AppError } from '../../plugins/error-handler.js';
import { prisma } from '../../lib/prisma.js';
import * as marketService from './service.js';
import type { BuyResourceRequest, SellResourceRequest, TradeableResource } from './types.js';

interface AuthenticatedRequest extends FastifyRequest {
  userId: string;
  playerId?: string;
  sessionPlayerId?: string;
  gameSessionId?: string;
}

export async function marketRoutes(app: FastifyInstance) {
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

  // GET /market/prices - Get all market prices (public endpoint)
  app.get('/market/prices', async () => {
    const prices = marketService.getMarketPrices();
    return { prices };
  });

  // GET /market/prices/:resourceType - Get price for specific resource
  app.get('/market/prices/:resourceType', async (request) => {
    const { resourceType } = request.params as { resourceType: string };

    if (!marketService.isTradeableResource(resourceType)) {
      throw AppError.badRequest(`Invalid or non-tradeable resource type: ${resourceType}`);
    }

    const price = marketService.getResourcePrice(resourceType as TradeableResource);
    if (!price) {
      throw AppError.notFound('Resource price not found');
    }

    return { price };
  });

  // POST /market/buy - Buy resources from NPC market (into Trade Hub node)
  app.post('/market/buy', {
    preHandler: [requireAuth, requireActiveSession],
  }, async (request) => {
    const req = request as AuthenticatedRequest;
    const body = request.body as BuyResourceRequest;

    if (!req.sessionPlayerId) {
      throw AppError.badRequest('Session context required');
    }

    // Validate request body
    if (!body.nodeId || !body.resourceType || body.quantity === undefined) {
      throw AppError.badRequest('Missing nodeId, resourceType, or quantity');
    }

    if (!marketService.isTradeableResource(body.resourceType)) {
      throw AppError.badRequest(`Invalid or non-tradeable resource type: ${body.resourceType}`);
    }

    const result = await marketService.buyResource(
      req.sessionPlayerId,
      body.nodeId,
      body.resourceType,
      body.quantity
    );

    if (!result.success) {
      throw AppError.badRequest(result.error ?? 'Failed to buy resource');
    }

    return result.data;
  });

  // POST /market/sell - Sell resources to NPC market (from Trade Hub node)
  app.post('/market/sell', {
    preHandler: [requireAuth, requireActiveSession],
  }, async (request) => {
    const req = request as AuthenticatedRequest;
    const body = request.body as SellResourceRequest;

    if (!req.sessionPlayerId) {
      throw AppError.badRequest('Session context required');
    }

    // Validate request body
    if (!body.nodeId || !body.resourceType || body.quantity === undefined) {
      throw AppError.badRequest('Missing nodeId, resourceType, or quantity');
    }

    if (!marketService.isTradeableResource(body.resourceType)) {
      throw AppError.badRequest(`Invalid or non-tradeable resource type: ${body.resourceType}`);
    }

    const result = await marketService.sellResource(
      req.sessionPlayerId,
      body.nodeId,
      body.resourceType,
      body.quantity
    );

    if (!result.success) {
      throw AppError.badRequest(result.error ?? 'Failed to sell resource');
    }

    return result.data;
  });
}
