import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config/index.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, code?: string) {
    return new AppError(400, message, code);
  }

  static unauthorized(message = 'Unauthorized', code?: string) {
    return new AppError(401, message, code);
  }

  static forbidden(message = 'Forbidden', code?: string) {
    return new AppError(403, message, code);
  }

  static notFound(message = 'Not found', code?: string) {
    return new AppError(404, message, code);
  }

  static conflict(message: string, code?: string) {
    return new AppError(409, message, code);
  }

  static internal(message = 'Internal server error', code?: string) {
    return new AppError(500, message, code);
  }
}

async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    request.log.error(error);

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          message: error.message,
          code: error.code,
          statusCode: error.statusCode,
        },
      });
    }

    // Fastify validation errors
    if (error.validation) {
      return reply.status(400).send({
        error: {
          message: 'Validation error',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: error.validation,
        },
      });
    }

    // Default error response
    const statusCode = error.statusCode ?? 500;
    const message = config.server.isProd && statusCode === 500
      ? 'Internal server error'
      : error.message;

    return reply.status(statusCode).send({
      error: {
        message,
        code: 'INTERNAL_ERROR',
        statusCode,
      },
    });
  });

  // Handle 404s
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        message: `Route ${request.method} ${request.url} not found`,
        code: 'NOT_FOUND',
        statusCode: 404,
      },
    });
  });
}

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
});
