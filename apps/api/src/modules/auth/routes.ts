import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import passport from 'passport';
import { config } from '../../config/index.js';
import { verifyAccessToken } from '../../lib/jwt.js';
import { AppError } from '../../plugins/error-handler.js';
import * as authService from './service.js';
import type { AuthUser } from './types.js';

export async function authRoutes(app: FastifyInstance) {
  // Middleware to verify JWT token
  const authenticate = async (request: FastifyRequest, _reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw AppError.unauthorized('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);
    const payload = await verifyAccessToken(token);

    if (!payload || !payload.sub) {
      throw AppError.unauthorized('Invalid or expired token');
    }

    const user = await authService.getUserById(payload.sub);
    if (!user) {
      throw AppError.unauthorized('User not found');
    }

    (request as FastifyRequest & { authUser: AuthUser }).authUser = user;
  };

  // Helper to get authenticated user from request
  const getAuthUser = (request: FastifyRequest): AuthUser => {
    return (request as FastifyRequest & { authUser: AuthUser }).authUser;
  };

  // ==================== Discord OAuth ====================

  app.get('/auth/discord', async (request, reply) => {
    if (!config.oauth.discord.clientId) {
      throw AppError.badRequest('Discord OAuth not configured');
    }

    return new Promise<void>((resolve, reject) => {
      passport.authenticate('discord', {
        session: false,
      })(request.raw, reply.raw, (err: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  app.get('/auth/discord/callback', async (request, reply) => {
    return new Promise<void>((resolve, reject) => {
      passport.authenticate('discord', {
        session: false,
        failureRedirect: `${config.urls.frontend}/login?error=discord_failed`,
      })(request.raw, reply.raw, async (err: Error) => {
        if (err) {
          return reject(err);
        }

        try {
          const profile = app.getPendingOAuthProfile();
          if (!profile) {
            return reply.redirect(`${config.urls.frontend}/login?error=no_profile`);
          }

          const user = await authService.findOrCreateUser(profile);
          const tokens = await authService.createSession(user);

          // Redirect to frontend with tokens
          const redirectUrl = new URL(`${config.urls.frontend}/auth/callback`);
          redirectUrl.searchParams.set('accessToken', tokens.accessToken);
          redirectUrl.searchParams.set('refreshToken', tokens.refreshToken);

          reply.redirect(redirectUrl.toString());
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  });

  // ==================== Google OAuth ====================

  app.get('/auth/google', async (request, reply) => {
    if (!config.oauth.google.clientId) {
      throw AppError.badRequest('Google OAuth not configured');
    }

    return new Promise<void>((resolve, reject) => {
      passport.authenticate('google', {
        session: false,
        scope: ['profile', 'email'],
      })(request.raw, reply.raw, (err: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  app.get('/auth/google/callback', async (request, reply) => {
    return new Promise<void>((resolve, reject) => {
      passport.authenticate('google', {
        session: false,
        failureRedirect: `${config.urls.frontend}/login?error=google_failed`,
      })(request.raw, reply.raw, async (err: Error) => {
        if (err) {
          return reject(err);
        }

        try {
          const profile = app.getPendingOAuthProfile();
          if (!profile) {
            return reply.redirect(`${config.urls.frontend}/login?error=no_profile`);
          }

          const user = await authService.findOrCreateUser(profile);
          const tokens = await authService.createSession(user);

          // Redirect to frontend with tokens
          const redirectUrl = new URL(`${config.urls.frontend}/auth/callback`);
          redirectUrl.searchParams.set('accessToken', tokens.accessToken);
          redirectUrl.searchParams.set('refreshToken', tokens.refreshToken);

          reply.redirect(redirectUrl.toString());
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  });

  // ==================== Token Management ====================

  app.post('/auth/refresh', async (request) => {
    const { refreshToken } = request.body as { refreshToken?: string };

    if (!refreshToken) {
      throw AppError.badRequest('Refresh token required');
    }

    const tokens = await authService.refreshSession(refreshToken);
    if (!tokens) {
      throw AppError.unauthorized('Invalid or expired refresh token');
    }

    return tokens;
  });

  app.post('/auth/logout', {
    preHandler: authenticate,
  }, async (request) => {
    const user = getAuthUser(request);
    await authService.revokeSession(user.id);
    return { success: true };
  });

  // ==================== User Info ====================

  app.get('/auth/me', {
    preHandler: authenticate,
  }, async (request) => {
    return { user: getAuthUser(request) };
  });

  app.patch('/auth/username', {
    preHandler: authenticate,
  }, async (request) => {
    const { username } = request.body as { username?: string };

    if (!username || username.length < 3 || username.length > 20) {
      throw AppError.badRequest('Username must be 3-20 characters');
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw AppError.badRequest('Username can only contain letters, numbers, and underscores');
    }

    const authUser = getAuthUser(request);

    try {
      const user = await authService.updateUsername(authUser.id, username);
      return { user };
    } catch (error) {
      if (error instanceof Error && error.message === 'Username already taken') {
        throw AppError.conflict('Username already taken');
      }
      throw error;
    }
  });
}
