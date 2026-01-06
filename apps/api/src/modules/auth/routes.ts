import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import passport from 'passport';
import { config } from '../../config/index.js';
import { verifyAccessToken } from '../../lib/jwt.js';
import { AppError } from '../../plugins/error-handler.js';
import * as authService from './service.js';
import type { AuthUser, OAuthProfile } from './types.js';

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

    // Mark response as sent so Fastify doesn't try to send another
    reply.hijack();

    // Passport redirects directly to Discord, bypassing Fastify's response handling
    passport.authenticate('discord', {
      session: false,
      scope: ['identify', 'email'],
    })(request.raw, reply.raw, (err: Error | null) => {
      if (err) {
        app.log.error({ err }, 'Discord OAuth redirect error');
      }
    });
  });

  app.get('/auth/discord/callback', async (request, reply) => {
    reply.hijack();

    // Passport expects Express-style req.query - add it to raw request
    const rawReq = request.raw as typeof request.raw & { query: Record<string, string> };
    rawReq.query = request.query as Record<string, string>;

    passport.authenticate('discord', {
      session: false,
    }, async (err: Error | null, user: OAuthProfile | false) => {
      const res = reply.raw;

      if (err) {
        app.log.error({ err }, 'Discord OAuth error');
        res.writeHead(302, { Location: `${config.urls.frontend}/login?error=discord_failed` });
        res.end();
        return;
      }

      if (!user) {
        app.log.warn('Discord OAuth - no user returned');
        res.writeHead(302, { Location: `${config.urls.frontend}/login?error=discord_failed` });
        res.end();
        return;
      }

      try {
        const dbUser = await authService.findOrCreateUser(user);
        const tokens = await authService.createSession(dbUser);

        const redirectUrl = new URL(`${config.urls.frontend}/auth/callback`);
        redirectUrl.searchParams.set('accessToken', tokens.accessToken);
        redirectUrl.searchParams.set('refreshToken', tokens.refreshToken);

        res.writeHead(302, { Location: redirectUrl.toString() });
        res.end();
      } catch (error) {
        app.log.error({ error }, 'Discord OAuth callback error');
        res.writeHead(302, { Location: `${config.urls.frontend}/login?error=discord_failed` });
        res.end();
      }
    })(rawReq, reply.raw, () => {});
  });

  // ==================== Google OAuth ====================

  app.get('/auth/google', async (request, reply) => {
    if (!config.oauth.google.clientId) {
      throw AppError.badRequest('Google OAuth not configured');
    }

    reply.hijack();

    passport.authenticate('google', {
      session: false,
      scope: ['profile', 'email'],
    })(request.raw, reply.raw, (err: Error | null) => {
      if (err) {
        app.log.error({ err }, 'Google OAuth redirect error');
      }
    });
  });

  app.get('/auth/google/callback', async (request, reply) => {
    reply.hijack();

    // Passport expects Express-style req.query - add it to raw request
    const rawReq = request.raw as typeof request.raw & { query: Record<string, string> };
    rawReq.query = request.query as Record<string, string>;

    passport.authenticate('google', {
      session: false,
    }, async (err: Error | null, user: OAuthProfile | false) => {
      const res = reply.raw;

      if (err) {
        app.log.error({ err }, 'Google OAuth error');
        res.writeHead(302, { Location: `${config.urls.frontend}/login?error=google_failed` });
        res.end();
        return;
      }

      if (!user) {
        app.log.warn('Google OAuth - no user returned');
        res.writeHead(302, { Location: `${config.urls.frontend}/login?error=google_failed` });
        res.end();
        return;
      }

      try {
        const dbUser = await authService.findOrCreateUser(user);
        const tokens = await authService.createSession(dbUser);

        const redirectUrl = new URL(`${config.urls.frontend}/auth/callback`);
        redirectUrl.searchParams.set('accessToken', tokens.accessToken);
        redirectUrl.searchParams.set('refreshToken', tokens.refreshToken);

        res.writeHead(302, { Location: redirectUrl.toString() });
        res.end();
      } catch (error) {
        app.log.error({ error }, 'Google OAuth callback error');
        res.writeHead(302, { Location: `${config.urls.frontend}/login?error=google_failed` });
        res.end();
      }
    })(rawReq, reply.raw, () => {});
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
