import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../../lib/jwt.js';
import { AppError } from '../../plugins/error-handler.js';
import { itemDefinitionService } from './service.js';
import type { ItemDefinitionInput, ItemDefinitionListQuery } from './types.js';
import type { ItemCategory, BlueprintQuality } from '@prisma/client';

interface AuthenticatedRequest extends FastifyRequest {
  userId: string;
}

export async function itemRoutes(app: FastifyInstance) {
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

  // GET /items - List all item definitions
  app.get('/items', {
    preHandler: [requireAuth],
  }, async (request) => {
    const query = request.query as {
      category?: string;
      quality?: string;
      isTradeable?: string;
      search?: string;
      limit?: string;
      offset?: string;
    };

    const listQuery: ItemDefinitionListQuery = {};

    if (query.category) {
      listQuery.category = query.category as ItemCategory;
    }
    if (query.quality) {
      listQuery.quality = query.quality as BlueprintQuality;
    }
    if (query.isTradeable !== undefined) {
      listQuery.isTradeable = query.isTradeable === 'true';
    }
    if (query.search) {
      listQuery.search = query.search;
    }
    if (query.limit) {
      listQuery.limit = parseInt(query.limit, 10);
    }
    if (query.offset) {
      listQuery.offset = parseInt(query.offset, 10);
    }

    return itemDefinitionService.getAll(listQuery);
  });

  // GET /items/stats - Get item statistics
  app.get('/items/stats', {
    preHandler: [requireAuth],
  }, async () => {
    return itemDefinitionService.getStats();
  });

  // GET /items/categories - List available categories
  app.get('/items/categories', {
    preHandler: [requireAuth],
  }, async () => {
    return {
      categories: ['RESOURCE', 'NODE_CORE', 'CONSUMABLE', 'EQUIPMENT', 'CRAFTED'],
    };
  });

  // POST /items/seed - Seed default items from hardcoded definitions
  app.post('/items/seed', {
    preHandler: [requireAuth],
  }, async () => {
    const result = await itemDefinitionService.seedDefaults();
    return {
      message: `Seeded ${result.created.length} items, skipped ${result.skipped.length} existing`,
      ...result,
    };
  });

  // GET /items/:id - Get a single item definition
  app.get('/items/:id', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const item = await itemDefinitionService.getById(id);

    if (!item) {
      throw AppError.notFound('Item definition not found');
    }

    return item;
  });

  // POST /items - Create a new item definition
  app.post('/items', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const body = request.body as ItemDefinitionInput;

    if (!body?.itemId || !body?.name || !body?.category) {
      throw AppError.badRequest('Missing required fields: itemId, name, category');
    }

    // Check for duplicate itemId
    const existing = await itemDefinitionService.getByItemId(body.itemId);
    if (existing) {
      throw AppError.badRequest(`Item with itemId "${body.itemId}" already exists`);
    }

    const item = await itemDefinitionService.create(body);
    reply.status(201);
    return item;
  });

  // PUT /items/:id - Update an item definition
  app.put('/items/:id', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<ItemDefinitionInput>;

    // Check if item exists
    const existing = await itemDefinitionService.getById(id);
    if (!existing) {
      throw AppError.notFound('Item definition not found');
    }

    // If changing itemId, check for conflicts
    if (body.itemId && body.itemId !== existing.itemId) {
      const conflict = await itemDefinitionService.getByItemId(body.itemId);
      if (conflict) {
        throw AppError.badRequest(`Item with itemId "${body.itemId}" already exists`);
      }
    }

    return itemDefinitionService.update(id, body);
  });

  // DELETE /items/:id - Delete an item definition
  app.delete('/items/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await itemDefinitionService.getById(id);
    if (!existing) {
      throw AppError.notFound('Item definition not found');
    }

    await itemDefinitionService.delete(id);
    reply.status(204);
  });

  // POST /items/:id/duplicate - Duplicate an item definition
  app.post('/items/:id/duplicate', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { itemId?: string } | undefined;

    const duplicated = await itemDefinitionService.duplicate(id, body?.itemId);
    if (!duplicated) {
      throw AppError.notFound('Item definition not found');
    }

    reply.status(201);
    return duplicated;
  });
}
