import cookie from '@fastify/cookie';
import session from '@fastify/session';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config/index.js';
import { redis } from '../lib/redis.js';

// Redis session store with proper callback interface
class RedisStore {
  private prefix = 'sess:';

  get(
    sessionId: string,
    callback: (err: Error | null, session: Record<string, unknown> | null) => void
  ): void {
    redis
      .get(this.prefix + sessionId)
      .then((data) => {
        if (!data) {
          callback(null, null);
        } else {
          callback(null, JSON.parse(data));
        }
      })
      .catch((err) => {
        callback(err, null);
      });
  }

  set(
    sessionId: string,
    session: Record<string, unknown>,
    callback: (err?: Error | null) => void
  ): void {
    const ttl = Math.floor(config.session.maxAge / 1000);
    redis
      .setex(this.prefix + sessionId, ttl, JSON.stringify(session))
      .then(() => {
        callback(null);
      })
      .catch((err) => {
        callback(err);
      });
  }

  destroy(sessionId: string, callback: (err?: Error | null) => void): void {
    redis
      .del(this.prefix + sessionId)
      .then(() => {
        callback(null);
      })
      .catch((err) => {
        callback(err);
      });
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
