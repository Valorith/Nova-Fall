import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../../lib/jwt.js';
import { AppError } from '../../plugins/error-handler.js';
import { buildingDefinitionService } from './service.js';
import type { BuildingDefinitionInput, BuildingDefinitionListQuery, BuildingCategory } from './types.js';

interface AuthenticatedRequest extends FastifyRequest {
  userId: string;
}

const VALID_CATEGORIES: BuildingCategory[] = ['turret', 'wall', 'structure', 'utility'];

export async function buildingRoutes(app: FastifyInstance) {
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

  // GET /buildings - List all building definitions
  app.get('/buildings', {
    preHandler: [requireAuth],
  }, async (request) => {
    const query = request.query as {
      category?: string;
      search?: string;
      limit?: string;
      offset?: string;
    };

    const listQuery: BuildingDefinitionListQuery = {};

    if (query.category && VALID_CATEGORIES.includes(query.category as BuildingCategory)) {
      listQuery.category = query.category as BuildingCategory;
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

    return buildingDefinitionService.getAll(listQuery);
  });

  // GET /buildings/stats - Get building statistics
  app.get('/buildings/stats', {
    preHandler: [requireAuth],
  }, async () => {
    return buildingDefinitionService.getStats();
  });

  // GET /buildings/categories - List available categories
  app.get('/buildings/categories', {
    preHandler: [requireAuth],
  }, async () => {
    return {
      categories: VALID_CATEGORIES,
    };
  });

  // GET /buildings/:id - Get a single building definition
  app.get('/buildings/:id', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const building = await buildingDefinitionService.getById(id);

    if (!building) {
      throw AppError.notFound('Building definition not found');
    }

    return building;
  });

  // POST /buildings - Create a new building definition
  app.post('/buildings', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const body = request.body as BuildingDefinitionInput;

    if (!body?.name) {
      throw AppError.badRequest('Missing required field: name');
    }

    // Validate category if provided
    if (body.category && !VALID_CATEGORIES.includes(body.category)) {
      throw AppError.badRequest(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }

    // Check for duplicate name
    const existing = await buildingDefinitionService.getByName(body.name);
    if (existing) {
      throw AppError.badRequest(`Building with name "${body.name}" already exists`);
    }

    const building = await buildingDefinitionService.create(body);
    reply.status(201);
    return building;
  });

  // PUT /buildings/:id - Update a building definition
  app.put('/buildings/:id', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<BuildingDefinitionInput>;

    // Check if building exists
    const existing = await buildingDefinitionService.getById(id);
    if (!existing) {
      throw AppError.notFound('Building definition not found');
    }

    // Validate category if provided
    if (body.category && !VALID_CATEGORIES.includes(body.category)) {
      throw AppError.badRequest(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }

    // If changing name, check for conflicts
    if (body.name && body.name !== existing.name) {
      const conflict = await buildingDefinitionService.getByName(body.name);
      if (conflict) {
        throw AppError.badRequest(`Building with name "${body.name}" already exists`);
      }
    }

    return buildingDefinitionService.update(id, body);
  });

  // DELETE /buildings/:id - Delete a building definition
  app.delete('/buildings/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await buildingDefinitionService.getById(id);
    if (!existing) {
      throw AppError.notFound('Building definition not found');
    }

    try {
      await buildingDefinitionService.delete(id);
      reply.status(204);
    } catch (error) {
      if (error instanceof Error && error.message.includes('linked items')) {
        throw AppError.badRequest(error.message);
      }
      throw error;
    }
  });

  // POST /buildings/:id/duplicate - Duplicate a building definition
  app.post('/buildings/:id/duplicate', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string } | undefined;

    // If new name provided, check for conflicts
    if (body?.name) {
      const conflict = await buildingDefinitionService.getByName(body.name);
      if (conflict) {
        throw AppError.badRequest(`Building with name "${body.name}" already exists`);
      }
    }

    const duplicated = await buildingDefinitionService.duplicate(id, body?.name);
    if (!duplicated) {
      throw AppError.notFound('Building definition not found');
    }

    reply.status(201);
    return duplicated;
  });
}
