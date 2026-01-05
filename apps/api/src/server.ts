import { buildApp } from './app.js';
import { config } from './config/index.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';

async function main() {
  const app = await buildApp();

  // Connect to Redis
  await redis.connect();

  // Verify database connection
  await prisma.$connect();
  console.log('Database connected');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    await app.close();
    await prisma.$disconnect();
    await redis.quit();

    console.log('Server closed');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start server
  try {
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });
    console.log(`Server running at http://${config.server.host}:${config.server.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
