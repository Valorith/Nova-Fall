import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../../lib/jwt.js';
import { AppError } from '../../plugins/error-handler.js';
import { unitDefinitionService } from './service.js';
import type { UnitDefinitionInput, UnitDefinitionListQuery, UnitCategory } from './types.js';

interface AuthenticatedRequest extends FastifyRequest {
  userId: string;
}

const VALID_CATEGORIES: UnitCategory[] = ['infantry', 'combat_vehicle', 'support_vehicle'];

export async function unitRoutes(app: FastifyInstance) {
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

  // GET /units - List all unit definitions
  app.get('/units', {
    preHandler: [requireAuth],
  }, async (request) => {
    const query = request.query as {
      category?: string;
      search?: string;
      limit?: string;
      offset?: string;
    };

    const listQuery: UnitDefinitionListQuery = {};

    if (query.category && VALID_CATEGORIES.includes(query.category as UnitCategory)) {
      listQuery.category = query.category as UnitCategory;
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

    return unitDefinitionService.getAll(listQuery);
  });

  // GET /units/stats - Get unit statistics
  app.get('/units/stats', {
    preHandler: [requireAuth],
  }, async () => {
    return unitDefinitionService.getStats();
  });

  // GET /units/categories - List available categories
  app.get('/units/categories', {
    preHandler: [requireAuth],
  }, async () => {
    return {
      categories: VALID_CATEGORIES,
    };
  });

  // GET /units/:id - Get a single unit definition
  app.get('/units/:id', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const unit = await unitDefinitionService.getById(id);

    if (!unit) {
      throw AppError.notFound('Unit definition not found');
    }

    return unit;
  });

  // POST /units - Create a new unit definition
  app.post('/units', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const body = request.body as UnitDefinitionInput;

    if (!body?.name) {
      throw AppError.badRequest('Missing required field: name');
    }

    // Validate category if provided
    if (body.category && !VALID_CATEGORIES.includes(body.category)) {
      throw AppError.badRequest(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }

    // Check for duplicate name
    const existing = await unitDefinitionService.getByName(body.name);
    if (existing) {
      throw AppError.badRequest(`Unit with name "${body.name}" already exists`);
    }

    const unit = await unitDefinitionService.create(body);
    reply.status(201);
    return unit;
  });

  // PUT /units/:id - Update a unit definition
  app.put('/units/:id', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<UnitDefinitionInput>;

    // Check if unit exists
    const existing = await unitDefinitionService.getById(id);
    if (!existing) {
      throw AppError.notFound('Unit definition not found');
    }

    // Validate category if provided
    if (body.category && !VALID_CATEGORIES.includes(body.category)) {
      throw AppError.badRequest(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }

    // If changing name, check for conflicts
    if (body.name && body.name !== existing.name) {
      const conflict = await unitDefinitionService.getByName(body.name);
      if (conflict) {
        throw AppError.badRequest(`Unit with name "${body.name}" already exists`);
      }
    }

    return unitDefinitionService.update(id, body);
  });

  // DELETE /units/:id - Delete a unit definition
  app.delete('/units/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await unitDefinitionService.getById(id);
    if (!existing) {
      throw AppError.notFound('Unit definition not found');
    }

    try {
      await unitDefinitionService.delete(id);
      reply.status(204);
    } catch (error) {
      if (error instanceof Error && error.message.includes('linked items')) {
        throw AppError.badRequest(error.message);
      }
      throw error;
    }
  });

  // POST /units/:id/duplicate - Duplicate a unit definition
  app.post('/units/:id/duplicate', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string } | undefined;

    // If new name provided, check for conflicts
    if (body?.name) {
      const conflict = await unitDefinitionService.getByName(body.name);
      if (conflict) {
        throw AppError.badRequest(`Unit with name "${body.name}" already exists`);
      }
    }

    const duplicated = await unitDefinitionService.duplicate(id, body?.name);
    if (!duplicated) {
      throw AppError.notFound('Unit definition not found');
    }

    reply.status(201);
    return duplicated;
  });
}
