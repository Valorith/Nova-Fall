import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../../lib/jwt.js';
import { AppError } from '../../plugins/error-handler.js';
import { aiPresetService } from './service.js';
import type { AIPresetInput, AIPresetCategory } from './types.js';

interface AuthenticatedRequest extends FastifyRequest {
  userId: string;
}

const VALID_CATEGORIES: AIPresetCategory[] = ['unit', 'building'];

export async function aiPresetRoutes(app: FastifyInstance) {
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

  // GET /ai-presets - List all AI presets
  app.get('/ai-presets', {
    preHandler: [requireAuth],
  }, async (request) => {
    const query = request.query as {
      category?: string;
      includeTemplates?: string;
      search?: string;
      limit?: string;
      offset?: string;
    };

    const listQuery: {
      category?: AIPresetCategory;
      includeTemplates?: boolean;
      search?: string;
      limit?: number;
      offset?: number;
    } = {};

    if (query.category && VALID_CATEGORIES.includes(query.category as AIPresetCategory)) {
      listQuery.category = query.category as AIPresetCategory;
    }
    if (query.includeTemplates !== undefined) {
      listQuery.includeTemplates = query.includeTemplates !== 'false';
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

    return aiPresetService.getAll(listQuery);
  });

  // GET /ai-presets/stats - Get AI preset statistics
  app.get('/ai-presets/stats', {
    preHandler: [requireAuth],
  }, async () => {
    return aiPresetService.getStats();
  });

  // GET /ai-presets/templates - Get only template presets
  app.get('/ai-presets/templates', {
    preHandler: [requireAuth],
  }, async () => {
    const templates = await aiPresetService.getTemplates();
    return { templates };
  });

  // GET /ai-presets/categories - List available categories
  app.get('/ai-presets/categories', {
    preHandler: [requireAuth],
  }, async () => {
    return {
      categories: VALID_CATEGORIES,
    };
  });

  // GET /ai-presets/:id - Get a single AI preset
  app.get('/ai-presets/:id', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const preset = await aiPresetService.getById(id);

    if (!preset) {
      throw AppError.notFound('AI preset not found');
    }

    return preset;
  });

  // POST /ai-presets - Create a new AI preset
  app.post('/ai-presets', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const body = request.body as AIPresetInput;

    if (!body?.name) {
      throw AppError.badRequest('Missing required field: name');
    }

    if (!body?.category) {
      throw AppError.badRequest('Missing required field: category');
    }

    if (!VALID_CATEGORIES.includes(body.category)) {
      throw AppError.badRequest(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }

    if (!body?.treeData) {
      throw AppError.badRequest('Missing required field: treeData');
    }

    // Basic tree structure validation
    if (!body.treeData.nodes || !body.treeData.edges || !body.treeData.rootId) {
      throw AppError.badRequest('Invalid treeData structure. Must include nodes, edges, and rootId.');
    }

    const preset = await aiPresetService.create(body);
    reply.status(201);
    return preset;
  });

  // PUT /ai-presets/:id - Update an AI preset
  app.put('/ai-presets/:id', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<AIPresetInput>;

    // Check if preset exists
    const existing = await aiPresetService.getById(id);
    if (!existing) {
      throw AppError.notFound('AI preset not found');
    }

    // Validate category if provided
    if (body.category && !VALID_CATEGORIES.includes(body.category)) {
      throw AppError.badRequest(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }

    // Basic tree structure validation if treeData provided
    if (body.treeData) {
      if (!body.treeData.nodes || !body.treeData.edges || !body.treeData.rootId) {
        throw AppError.badRequest('Invalid treeData structure. Must include nodes, edges, and rootId.');
      }
    }

    return aiPresetService.update(id, body);
  });

  // DELETE /ai-presets/:id - Delete an AI preset
  app.delete('/ai-presets/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await aiPresetService.getById(id);
    if (!existing) {
      throw AppError.notFound('AI preset not found');
    }

    // Templates cannot be deleted
    if (existing.isTemplate) {
      throw AppError.badRequest('Template presets cannot be deleted.');
    }

    try {
      await aiPresetService.delete(id);
      reply.status(204);
    } catch (error) {
      if (error instanceof Error && error.message.includes('linked definitions')) {
        throw AppError.badRequest(error.message);
      }
      throw error;
    }
  });

  // POST /ai-presets/:id/duplicate - Duplicate an AI preset
  app.post('/ai-presets/:id/duplicate', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string } | undefined;

    const duplicated = await aiPresetService.duplicate(id, body?.name);
    if (!duplicated) {
      throw AppError.notFound('AI preset not found');
    }

    reply.status(201);
    return duplicated;
  });
}
