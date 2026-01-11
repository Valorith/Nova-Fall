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

  // ==================== NODE CORE MANAGEMENT ====================

  // GET /nodes/shop-items - Get all items purchasable at HQ (any item with hqCost set)
  app.get('/nodes/shop-items', {
    preHandler: [requireAuth],
  }, async () => {
    // Fetch ALL items that have hqCost set (purchasable at HQ)
    const items = await prisma.itemDefinition.findMany({
      where: {
        hqCost: { not: null },
      },
      orderBy: [
        { category: 'asc' },
        { name: 'asc' },
      ],
    });

    return {
      items: items.map((item) => ({
        itemId: item.itemId,
        name: item.name,
        description: item.description,
        category: item.category,
        icon: item.icon,
        color: item.color,
        targetNodeType: item.targetNodeType,
        hqCost: item.hqCost ?? 100,
        efficiency: item.efficiency,
        quality: item.quality,
      })),
    };
  });

  // POST /nodes/:id/shop/purchase - Purchase an item at HQ
  // Requires active game session, must be at HQ
  app.post('/nodes/:id/shop/purchase', {
    preHandler: [requireAuth, requireActiveSession],
  }, async (request) => {
    const { id: nodeId } = request.params as { id: string };
    const { itemId, quantity = 1 } = request.body as { itemId: string; quantity?: number };
    const req = request as AuthenticatedRequest;

    if (!req.playerId || !req.gameSessionId || !req.sessionPlayerId) {
      throw AppError.badRequest('Session context required');
    }

    if (!itemId) {
      throw AppError.badRequest('itemId is required');
    }

    const result = await nodeService.purchaseItem(
      nodeId,
      itemId,
      req.playerId,
      req.gameSessionId,
      req.sessionPlayerId,
      quantity
    );

    if (!result.success) {
      throw AppError.badRequest(result.error ?? 'Failed to purchase item');
    }

    return {
      success: true,
      storage: result.storage,
      creditsRemaining: result.creditsRemaining,
    };
  });

  // POST /nodes/:id/cores/install - Install a core from storage
  // Requires active game session
  app.post('/nodes/:id/cores/install', {
    preHandler: [requireAuth, requireActiveSession],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { coreId } = request.body as { coreId: string };
    const req = request as AuthenticatedRequest;

    if (!req.playerId || !req.gameSessionId) {
      throw AppError.badRequest('Session context required');
    }

    if (!coreId) {
      throw AppError.badRequest('coreId is required');
    }

    const result = await nodeService.installCore(
      id,
      coreId,
      req.playerId,
      req.gameSessionId
    );

    if (!result.success) {
      throw AppError.badRequest(result.error ?? 'Failed to install core');
    }

    return {
      success: true,
      installedCoreId: result.installedCoreId,
      storage: result.storage,
    };
  });

  // DELETE /nodes/:id/cores - Destroy installed core
  // Requires active game session
  app.delete('/nodes/:id/cores', {
    preHandler: [requireAuth, requireActiveSession],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const req = request as AuthenticatedRequest;

    if (!req.playerId || !req.gameSessionId) {
      throw AppError.badRequest('Session context required');
    }

    const result = await nodeService.destroyCore(
      id,
      req.playerId,
      req.gameSessionId
    );

    if (!result.success) {
      throw AppError.badRequest(result.error ?? 'Failed to destroy core');
    }

    return { success: true, storage: result.storage };
  });

  // DEV ONLY: Add items to a node's storage
  app.post<{
    Params: { id: string };
    Body: { itemId: string; quantity: number };
  }>('/nodes/:id/dev/add-item', {
    preHandler: [requireAuth, requireActiveSession],
  }, async (request) => {
    const { id } = request.params;
    const { itemId, quantity } = request.body;
    const req = request as AuthenticatedRequest;

    if (!req.playerId || !req.gameSessionId) {
      throw AppError.badRequest('Session context required');
    }

    if (!itemId || typeof quantity !== 'number' || quantity <= 0) {
      throw AppError.badRequest('Invalid itemId or quantity');
    }

    // Verify node exists and belongs to the player
    const node = await prisma.node.findFirst({
      where: {
        id,
        gameSessionId: req.gameSessionId,
        ownerId: req.playerId,
      },
    });

    if (!node) {
      throw AppError.notFound('Node not found or not owned by player');
    }

    // Verify item exists in database
    const item = await prisma.itemDefinition.findUnique({
      where: { itemId },
    });

    if (!item) {
      throw AppError.notFound('Item not found in database');
    }

    // Update storage
    const currentStorage = (node.storage as Record<string, number>) || {};
    const newStorage = {
      ...currentStorage,
      [itemId]: (currentStorage[itemId] || 0) + quantity,
    };

    const updatedNode = await prisma.node.update({
      where: { id },
      data: { storage: newStorage },
    });

    return {
      success: true,
      storage: updatedNode.storage,
      added: { itemId, quantity },
    };
  });
}
