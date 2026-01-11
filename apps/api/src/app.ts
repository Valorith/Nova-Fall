import Fastify from 'fastify';
import { config } from './config/index.js';
import corsPlugin from './plugins/cors.js';
import sessionPlugin from './plugins/session.js';
import passportPlugin from './plugins/passport.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import { healthRoutes } from './modules/health/index.js';
import { authRoutes } from './modules/auth/index.js';
import { nodeRoutes } from './modules/nodes/index.js';
import { sessionRoutes } from './modules/sessions/index.js';
import { gameRoutes } from './modules/game/index.js';
import { marketRoutes } from './modules/market/index.js';
import { transferRoutes } from './modules/transfers/index.js';
import { blueprintRoutes } from './modules/blueprints/index.js';
import { uploadRoutes } from './modules/uploads/index.js';
import { itemRoutes } from './modules/items/index.js';
import { craftingRoutes } from './modules/crafting/index.js';
import { settingsRoutes } from './modules/settings/index.js';

export async function buildApp() {
  const app = Fastify({
    logger: config.server.isDev
      ? {
          level: 'debug',
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            },
          },
        }
      : {
          level: 'info',
        },
  });

  // Register plugins
  await app.register(corsPlugin);
  await app.register(sessionPlugin);
  await app.register(passportPlugin);
  await app.register(errorHandlerPlugin);

  // Register modules
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(nodeRoutes);
  await app.register(sessionRoutes);
  await app.register(gameRoutes);
  await app.register(marketRoutes);
  await app.register(transferRoutes);
  await app.register(blueprintRoutes);
  await app.register(uploadRoutes);
  await app.register(itemRoutes);
  await app.register(craftingRoutes);
  await app.register(settingsRoutes);

  // API version endpoint
  app.get('/api/v1', async () => {
    return {
      name: 'Nova Fall API',
      version: '0.1.0',
      env: config.server.env,
    };
  });

  return app;
}
