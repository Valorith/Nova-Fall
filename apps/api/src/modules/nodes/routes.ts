import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../../lib/jwt.js';
import { AppError } from '../../plugins/error-handler.js';
import * as nodeService from './service.js';
import type { NodeListQuery } from './types.js';

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
      (request as FastifyRequest & { userId?: string }).userId = payload.sub;
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

    (request as FastifyRequest & { userId: string }).userId = payload.sub;
  };

  // GET /nodes - List all nodes (with optional pagination)
  app.get('/nodes', {
    preHandler: optionalAuth,
  }, async (request) => {
    const query = request.query as NodeListQuery;

    // If no pagination specified, return all nodes for initial map load
    if (!query.page && !query.pageSize) {
      const nodes = await nodeService.getAllNodes();
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
  app.post('/nodes/:id/claim', {
    preHandler: requireAuth,
  }, async (request) => {
    const { id } = request.params as { id: string };
    const userId = (request as FastifyRequest & { userId: string }).userId;

    // Get player ID from user
    const { prisma } = await import('../../lib/prisma.js');
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { player: true },
    });

    if (!user?.player) {
      throw AppError.badRequest('No player profile found');
    }

    const result = await nodeService.claimNode(id, user.player.id);

    if (!result.success) {
      throw AppError.badRequest(result.error ?? 'Failed to claim node');
    }

    return { node: result.node };
  });
}
