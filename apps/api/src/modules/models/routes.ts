import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../../lib/jwt.js';
import { AppError } from '../../plugins/error-handler.js';
import { modelService } from './service.js';

interface AuthenticatedRequest extends FastifyRequest {
  userId: string;
}

export async function modelRoutes(app: FastifyInstance) {
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

  // GET /models - List all available model files
  app.get('/models', {
    preHandler: [requireAuth],
  }, async () => {
    return modelService.listModels();
  });

  // GET /models/info - Get info about a specific model file
  app.get('/models/info', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { path: modelPath } = request.query as { path?: string };

    if (!modelPath) {
      throw AppError.badRequest('Missing required query parameter: path');
    }

    const info = await modelService.getModelInfo(modelPath);
    if (!info) {
      throw AppError.notFound('Model file not found');
    }

    return info;
  });
}
