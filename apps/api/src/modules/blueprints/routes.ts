import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../../lib/jwt.js';
import { AppError } from '../../plugins/error-handler.js';
import * as blueprintService from './service.js';
import type {
  CreateBlueprintRequest,
  UpdateBlueprintRequest,
  ListBlueprintsQuery,
  BlueprintMaterial,
} from './types.js';
import {
  BlueprintCategory,
  BlueprintQuality,
  NodeType,
} from '@nova-fall/shared';

interface AuthenticatedRequest extends FastifyRequest {
  userId: string;
}

// Validation helpers
function isValidCategory(value: unknown): value is BlueprintCategory {
  return typeof value === 'string' && Object.values(BlueprintCategory).includes(value as BlueprintCategory);
}

function isValidQuality(value: unknown): value is BlueprintQuality {
  return typeof value === 'string' && Object.values(BlueprintQuality).includes(value as BlueprintQuality);
}

function isValidNodeType(value: unknown): value is NodeType {
  return typeof value === 'string' && Object.values(NodeType).includes(value as NodeType);
}

function validateBlueprintInput(body: unknown): { valid: true; data: CreateBlueprintRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be an object' };
  }

  const data = body as Record<string, unknown>;

  // Required fields
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    return { valid: false, error: 'Name is required and must be a non-empty string' };
  }

  if (!data.category || !isValidCategory(data.category)) {
    return { valid: false, error: `Invalid category. Must be one of: ${Object.values(BlueprintCategory).join(', ')}` };
  }

  if (!data.quality || !isValidQuality(data.quality)) {
    return { valid: false, error: `Invalid quality. Must be one of: ${Object.values(BlueprintQuality).join(', ')}` };
  }

  if (data.learned === undefined || typeof data.learned !== 'boolean') {
    return { valid: false, error: 'learned must be a boolean' };
  }

  if (data.craftTime === undefined || typeof data.craftTime !== 'number' || data.craftTime < 0) {
    return { valid: false, error: 'craftTime must be a non-negative number' };
  }

  if (!Array.isArray(data.nodeTypes) || data.nodeTypes.length === 0) {
    return { valid: false, error: 'nodeTypes must be a non-empty array of node types' };
  }

  for (const nodeType of data.nodeTypes) {
    if (!isValidNodeType(nodeType)) {
      return { valid: false, error: `Invalid node type: ${nodeType}. Must be one of: ${Object.values(NodeType).join(', ')}` };
    }
  }

  if (data.nodeTierRequired === undefined || typeof data.nodeTierRequired !== 'number' || data.nodeTierRequired < 1) {
    return { valid: false, error: 'nodeTierRequired must be a positive number' };
  }

  if (!Array.isArray(data.inputs)) {
    return { valid: false, error: 'inputs must be an array' };
  }

  for (const input of data.inputs) {
    if (!input || typeof input !== 'object') {
      return { valid: false, error: 'Each input must be an object with itemId and quantity' };
    }
    const inputObj = input as Record<string, unknown>;
    if (!inputObj.itemId || typeof inputObj.itemId !== 'string') {
      return { valid: false, error: 'Each input must have a string itemId' };
    }
    if (typeof inputObj.quantity !== 'number' || inputObj.quantity <= 0) {
      return { valid: false, error: 'Each input must have a positive quantity' };
    }
  }

  if (!Array.isArray(data.outputs)) {
    return { valid: false, error: 'outputs must be an array' };
  }

  // Outputs can be empty - blueprint is considered disabled until inputs and outputs are defined
  for (const output of data.outputs) {
    if (!output || typeof output !== 'object') {
      return { valid: false, error: 'Each output must be an object with itemId and quantity' };
    }
    const outputObj = output as Record<string, unknown>;
    if (!outputObj.itemId || typeof outputObj.itemId !== 'string') {
      return { valid: false, error: 'Each output must have a string itemId' };
    }
    if (typeof outputObj.quantity !== 'number' || outputObj.quantity <= 0) {
      return { valid: false, error: 'Each output must have a positive quantity' };
    }
  }

  return {
    valid: true,
    data: {
      name: data.name.trim(),
      description: typeof data.description === 'string' ? data.description : null,
      category: data.category as BlueprintCategory,
      quality: data.quality as BlueprintQuality,
      learned: data.learned,
      craftTime: data.craftTime,
      nodeTypes: data.nodeTypes as NodeType[],
      nodeTierRequired: data.nodeTierRequired,
      inputs: data.inputs as CreateBlueprintRequest['inputs'],
      outputs: data.outputs as CreateBlueprintRequest['outputs'],
      icon: typeof data.icon === 'string' ? data.icon : null,
    },
  };
}

export async function blueprintRoutes(app: FastifyInstance) {
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

  // GET /blueprints - List all blueprints with filtering
  app.get('/blueprints', {
    preHandler: [requireAuth],
  }, async (request) => {
    const query = request.query as Record<string, unknown>;

    const listQuery: ListBlueprintsQuery = {
      limit: typeof query.limit === 'string' ? parseInt(query.limit, 10) : 50,
      offset: typeof query.offset === 'string' ? parseInt(query.offset, 10) : 0,
    };

    // Only add optional fields if they have valid values
    if (isValidCategory(query.category)) {
      listQuery.category = query.category;
    }
    if (isValidQuality(query.quality)) {
      listQuery.quality = query.quality;
    }
    if (query.learned === 'true' || query.learned === 'false') {
      listQuery.learned = query.learned;
    }
    if (typeof query.search === 'string' && query.search.length > 0) {
      listQuery.search = query.search;
    }

    return blueprintService.listBlueprints(listQuery);
  });

  // GET /blueprints/stats - Get blueprint statistics
  app.get('/blueprints/stats', {
    preHandler: [requireAuth],
  }, async () => {
    return blueprintService.getBlueprintStats();
  });

  // GET /blueprints/categories - Get all enum values for categories
  app.get('/blueprints/categories', {
    preHandler: [requireAuth],
  }, async () => {
    return {
      categories: Object.values(BlueprintCategory),
    };
  });

  // GET /blueprints/qualities - Get all enum values for qualities
  app.get('/blueprints/qualities', {
    preHandler: [requireAuth],
  }, async () => {
    return {
      qualities: Object.values(BlueprintQuality),
    };
  });

  // GET /blueprints/node-types - Get all enum values for node types
  app.get('/blueprints/node-types', {
    preHandler: [requireAuth],
  }, async () => {
    return {
      nodeTypes: Object.values(NodeType),
    };
  });

  // GET /blueprints/:id - Get a single blueprint
  app.get('/blueprints/:id', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { id } = request.params as { id: string };

    const blueprint = await blueprintService.getBlueprint(id);

    if (!blueprint) {
      throw AppError.notFound('Blueprint not found');
    }

    return blueprint;
  });

  // POST /blueprints - Create a new blueprint
  app.post('/blueprints', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const validation = validateBlueprintInput(request.body);

    if (!validation.valid) {
      throw AppError.badRequest(validation.error);
    }

    const blueprint = await blueprintService.createBlueprint(validation.data);

    reply.status(201);
    return blueprint;
  });

  // PUT /blueprints/:id - Update a blueprint
  app.put('/blueprints/:id', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    // Build update data with validation
    const updateData: UpdateBlueprintRequest = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        throw AppError.badRequest('Name must be a non-empty string');
      }
      updateData.name = body.name.trim();
    }

    if (body.description !== undefined) {
      updateData.description = typeof body.description === 'string' ? body.description : null;
    }

    if (body.category !== undefined) {
      if (!isValidCategory(body.category)) {
        throw AppError.badRequest(`Invalid category. Must be one of: ${Object.values(BlueprintCategory).join(', ')}`);
      }
      updateData.category = body.category;
    }

    if (body.quality !== undefined) {
      if (!isValidQuality(body.quality)) {
        throw AppError.badRequest(`Invalid quality. Must be one of: ${Object.values(BlueprintQuality).join(', ')}`);
      }
      updateData.quality = body.quality;
    }

    if (body.learned !== undefined) {
      if (typeof body.learned !== 'boolean') {
        throw AppError.badRequest('learned must be a boolean');
      }
      updateData.learned = body.learned;
    }

    if (body.craftTime !== undefined) {
      if (typeof body.craftTime !== 'number' || body.craftTime < 0) {
        throw AppError.badRequest('craftTime must be a non-negative number');
      }
      updateData.craftTime = body.craftTime;
    }

    if (body.nodeTypes !== undefined) {
      if (!Array.isArray(body.nodeTypes) || body.nodeTypes.length === 0) {
        throw AppError.badRequest('nodeTypes must be a non-empty array');
      }
      for (const nodeType of body.nodeTypes) {
        if (!isValidNodeType(nodeType)) {
          throw AppError.badRequest(`Invalid node type: ${nodeType}`);
        }
      }
      updateData.nodeTypes = body.nodeTypes as NodeType[];
    }

    if (body.nodeTierRequired !== undefined) {
      if (typeof body.nodeTierRequired !== 'number' || body.nodeTierRequired < 1) {
        throw AppError.badRequest('nodeTierRequired must be a positive number');
      }
      updateData.nodeTierRequired = body.nodeTierRequired;
    }

    if (body.inputs !== undefined) {
      if (!Array.isArray(body.inputs)) {
        throw AppError.badRequest('inputs must be an array');
      }
      updateData.inputs = body.inputs as BlueprintMaterial[];
    }

    if (body.outputs !== undefined) {
      if (!Array.isArray(body.outputs)) {
        throw AppError.badRequest('outputs must be an array');
      }
      // Outputs can be empty - blueprint is considered disabled until inputs and outputs are defined
      updateData.outputs = body.outputs as BlueprintMaterial[];
    }

    if (body.icon !== undefined) {
      updateData.icon = typeof body.icon === 'string' ? body.icon : null;
    }

    const blueprint = await blueprintService.updateBlueprint(id, updateData);

    if (!blueprint) {
      throw AppError.notFound('Blueprint not found');
    }

    return blueprint;
  });

  // DELETE /blueprints/:id - Delete a blueprint
  app.delete('/blueprints/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const deleted = await blueprintService.deleteBlueprint(id);

    if (!deleted) {
      throw AppError.notFound('Blueprint not found');
    }

    reply.status(204);
    return;
  });

  // POST /blueprints/:id/duplicate - Duplicate a blueprint
  app.post('/blueprints/:id/duplicate', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown> | undefined;

    // Optional overrides
    const overrides: Partial<CreateBlueprintRequest> = {};

    if (body?.name && typeof body.name === 'string') {
      overrides.name = body.name;
    }

    if (body?.quality && isValidQuality(body.quality)) {
      overrides.quality = body.quality;
    }

    const blueprint = await blueprintService.duplicateBlueprint(id, overrides);

    if (!blueprint) {
      throw AppError.notFound('Blueprint not found');
    }

    reply.status(201);
    return blueprint;
  });
}
