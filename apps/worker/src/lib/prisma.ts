import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';

export const prisma = new PrismaClient({
  datasourceUrl: config.database.url,
  log: config.nodeEnv === 'development' ? ['query', 'error', 'warn'] : ['error'],
});
