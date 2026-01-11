import { env } from './env.js';

export const config = {
  server: {
    port: env.PORT,
    host: env.HOST,
    env: env.NODE_ENV,
    isDev: env.NODE_ENV === 'development',
    isProd: env.NODE_ENV === 'production',
    modelsPath: env.MODELS_PATH,
  },

  database: {
    url: env.DATABASE_URL,
  },

  redis: {
    url: env.REDIS_URL,
  },

  session: {
    secret: env.SESSION_SECRET,
    cookieName: 'nova_session',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },

  oauth: {
    discord: {
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
      callbackUrl: `${env.API_URL}/auth/discord/callback`,
    },
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackUrl: `${env.API_URL}/auth/google/callback`,
    },
  },

  urls: {
    frontend: env.FRONTEND_URL,
    api: env.API_URL,
  },

  game: {
    tickInterval: env.GAME_TICK_INTERVAL,
    upkeepCheckInterval: env.UPKEEP_CHECK_INTERVAL,
  },
} as const;

export { env };
