import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  redis: {
    url: requireEnv('REDIS_URL'),
  },
  database: {
    url: requireEnv('DATABASE_URL'),
  },
  game: {
    tickInterval: parseInt(process.env['GAME_TICK_INTERVAL'] ?? '30000', 10), // 30 seconds
  },
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
};
