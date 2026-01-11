import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../../lib/jwt.js';
import { AppError } from '../../plugins/error-handler.js';
import { prisma } from '../../lib/prisma.js';
import {
  getBlueprintsForNode,
  getCraftingQueue,
  startCrafting,
  cancelCraft,
  learnBlueprint,
  isBlueprintLearned,
} from './service.js';
import type { StartCraftRequestBody } from './types.js';
import { NodeType } from '@nova-fall/shared';

interface AuthenticatedRequest extends FastifyRequest {
  userId: string;
  playerId?: string;
  sessionPlayerId?: string;
  gameSessionId?: string;
}

export async function craftingRoutes(app: FastifyInstance) {
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

    // Find active session
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
   * GET /nodes/:nodeId/blueprints
   * Get available blueprints for a node's type and tier
   */
  app.get('/nodes/:nodeId/blueprints', {
    preHandler: [requireAuth, requireActiveSession],
  }, async (request) => {
    const req = request as AuthenticatedRequest;
    const { nodeId } = request.params as { nodeId: string };

    if (!req.playerId || !req.gameSessionId) {
      throw AppError.badRequest('Session context required');
    }

    // Fetch node to get type and tier
    const node = await prisma.node.findFirst({
      where: {
        id: nodeId,
        gameSessionId: req.gameSessionId,
      },
      select: {
        id: true,
        type: true,
        tier: true,
        ownerId: true,
      },
    });

    if (!node) {
      throw AppError.notFound('Node not found in this session');
    }

    if (node.ownerId !== req.playerId) {
      throw AppError.forbidden('You do not own this node');
    }

    const blueprints = await getBlueprintsForNode(node.type as NodeType, node.tier, req.playerId, req.gameSessionId);

    return { blueprints };
  });

  /**
   * GET /nodes/:nodeId/crafting
   * Get the current crafting queue for a node
   */
  app.get('/nodes/:nodeId/crafting', {
    preHandler: [requireAuth, requireActiveSession],
  }, async (request) => {
    const req = request as AuthenticatedRequest;
    const { nodeId } = request.params as { nodeId: string };

    if (!req.playerId || !req.gameSessionId) {
      throw AppError.badRequest('Session context required');
    }

    // Verify node exists and is owned by player
    const node = await prisma.node.findFirst({
      where: {
        id: nodeId,
        gameSessionId: req.gameSessionId,
        ownerId: req.playerId,
      },
      select: { id: true },
    });

    if (!node) {
      throw AppError.notFound('Node not found or not owned by you');
    }

    const queue = await getCraftingQueue(nodeId);

    return { queue };
  });

  /**
   * POST /nodes/:nodeId/craft
   * Start crafting a blueprint
   */
  app.post('/nodes/:nodeId/craft', {
    preHandler: [requireAuth, requireActiveSession],
  }, async (request) => {
    const req = request as AuthenticatedRequest;
    const { nodeId } = request.params as { nodeId: string };
    const body = request.body as StartCraftRequestBody;

    if (!req.playerId || !req.gameSessionId) {
      throw AppError.badRequest('Session context required');
    }

    // Validate request body
    if (!body.blueprintId || typeof body.blueprintId !== 'string') {
      throw AppError.badRequest('blueprintId is required');
    }

    if (!body.quantity || typeof body.quantity !== 'number' || body.quantity < 1) {
      throw AppError.badRequest('quantity must be a positive number');
    }

    // Verify node exists in this session
    const node = await prisma.node.findFirst({
      where: {
        id: nodeId,
        gameSessionId: req.gameSessionId,
      },
      select: { id: true },
    });

    if (!node) {
      throw AppError.notFound('Node not found in this session');
    }

    const result = await startCrafting(nodeId, req.playerId, req.gameSessionId, body.blueprintId, body.quantity);

    if (!result.success) {
      throw AppError.badRequest(result.error);
    }

    return {
      queue: result.queue,
      storage: result.storage,
      message: 'Crafting started successfully',
    };
  });

  /**
   * DELETE /nodes/:nodeId/craft/:queueId
   * Cancel a queued craft and refund materials
   */
  app.delete('/nodes/:nodeId/craft/:queueId', {
    preHandler: [requireAuth, requireActiveSession],
  }, async (request) => {
    const req = request as AuthenticatedRequest;
    const { nodeId, queueId } = request.params as { nodeId: string; queueId: string };

    if (!req.playerId || !req.gameSessionId) {
      throw AppError.badRequest('Session context required');
    }

    // Verify node exists in this session
    const node = await prisma.node.findFirst({
      where: {
        id: nodeId,
        gameSessionId: req.gameSessionId,
      },
      select: { id: true },
    });

    if (!node) {
      throw AppError.notFound('Node not found in this session');
    }

    const result = await cancelCraft(nodeId, req.playerId, queueId);

    if (!result.success) {
      throw AppError.badRequest(result.error);
    }

    return {
      queue: result.queue,
      storage: result.storage,
      refunded: result.refunded,
      message: 'Craft cancelled, materials refunded',
    };
  });

  /**
   * POST /nodes/:nodeId/learn-blueprint
   * Learn a blueprint by consuming a blueprint item from node storage
   */
  app.post('/nodes/:nodeId/learn-blueprint', {
    preHandler: [requireAuth, requireActiveSession],
  }, async (request) => {
    const req = request as AuthenticatedRequest;
    const { nodeId } = request.params as { nodeId: string };
    const body = request.body as { blueprintItemId: string };

    if (!req.playerId || !req.gameSessionId) {
      throw AppError.badRequest('Session context required');
    }

    if (!body.blueprintItemId || typeof body.blueprintItemId !== 'string') {
      throw AppError.badRequest('blueprintItemId is required');
    }

    // Verify node exists in this session
    const node = await prisma.node.findFirst({
      where: {
        id: nodeId,
        gameSessionId: req.gameSessionId,
      },
      select: { id: true },
    });

    if (!node) {
      throw AppError.notFound('Node not found in this session');
    }

    const result = await learnBlueprint(nodeId, req.playerId, req.gameSessionId, body.blueprintItemId);

    if (!result.success) {
      throw AppError.badRequest(result.error ?? 'Failed to learn blueprint');
    }

    if (result.alreadyLearned) {
      return {
        alreadyLearned: true,
        blueprintId: result.learnedBlueprintId,
        message: 'You have already learned this blueprint',
      };
    }

    return {
      storage: result.storage,
      blueprintId: result.learnedBlueprintId,
      message: 'Blueprint learned successfully',
    };
  });

  /**
   * GET /blueprints/:blueprintId/learned
   * Check if a blueprint is learned by the current player
   */
  app.get('/blueprints/:blueprintId/learned', {
    preHandler: [requireAuth, requireActiveSession],
  }, async (request) => {
    const req = request as AuthenticatedRequest;
    const { blueprintId } = request.params as { blueprintId: string };

    if (!req.playerId || !req.gameSessionId) {
      throw AppError.badRequest('Session context required');
    }

    const result = await isBlueprintLearned(req.playerId, req.gameSessionId, blueprintId);

    return {
      blueprintId,
      blueprintName: result.blueprintName,
      learned: result.learned,
    };
  });
}
