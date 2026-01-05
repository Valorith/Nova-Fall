import cookie from '@fastify/cookie';
import session from '@fastify/session';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config/index.js';
import { redis } from '../lib/redis.js';

// Redis session store
class RedisStore {
  private prefix = 'sess:';

  async get(sessionId: string): Promise<Record<string, unknown> | null> {
    const data = await redis.get(this.prefix + sessionId);
    if (!data) return null;
    return JSON.parse(data);
  }

  async set(sessionId: string, session: Record<string, unknown>, callback?: () => void): Promise<void> {
    const ttl = config.session.maxAge / 1000;
    await redis.setex(this.prefix + sessionId, ttl, JSON.stringify(session));
    callback?.();
  }

  async destroy(sessionId: string, callback?: () => void): Promise<void> {
    await redis.del(this.prefix + sessionId);
    callback?.();
  }
}

async function sessionPlugin(fastify: FastifyInstance) {
  await fastify.register(cookie);

  await fastify.register(session, {
    secret: config.session.secret,
    cookieName: config.session.cookieName,
    cookie: {
      secure: config.server.isProd,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: config.session.maxAge,
    },
    store: new RedisStore() as never,
  });
}

export default fp(sessionPlugin, {
  name: 'session',
});
