import 'dotenv/config';
import { z } from 'zod';

const isDev = process.env.NODE_ENV !== 'production';

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().startsWith('redis://'),

  // Session
  SESSION_SECRET: z.string().min(32),

  // OAuth - Discord
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),

  // OAuth - Google
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // URLs - Required in production, defaults in development
  FRONTEND_URL: isDev
    ? z.string().url().default('http://localhost:5173')
    : z.string().url({ message: 'FRONTEND_URL is required in production' }),
  API_URL: isDev
    ? z.string().url().default('http://localhost:3000')
    : z.string().url({ message: 'API_URL is required in production' }),

  // Game Settings
  GAME_TICK_INTERVAL: z.coerce.number().default(5000),
  UPKEEP_CHECK_INTERVAL: z.coerce.number().default(3600000),

  // Asset Paths
  MODELS_PATH: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
