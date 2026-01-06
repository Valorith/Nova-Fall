import { Queue, Worker } from 'bullmq';
import { config } from './config.js';
import { redis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import { processGameTick } from './jobs/gameTick.js';
import { processUpkeep } from './jobs/upkeep.js';

export const VERSION = '0.1.0';

// Queue names
const GAME_TICK_QUEUE = 'game-tick';
const UPKEEP_QUEUE = 'upkeep';

// Create queues
const gameTickQueue = new Queue(GAME_TICK_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});

const upkeepQueue = new Queue(UPKEEP_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

// Create workers
const gameTickWorker = new Worker(
  GAME_TICK_QUEUE,
  async () => {
    await processGameTick();
  },
  {
    connection: redis,
    concurrency: 1, // Only one tick at a time
    limiter: {
      max: 1,
      duration: 1000, // Max 1 job per second (safety)
    },
  }
);

const upkeepWorker = new Worker(
  UPKEEP_QUEUE,
  async () => {
    await processUpkeep();
  },
  {
    connection: redis,
    concurrency: 1, // Only one upkeep job at a time
  }
);

// Handle worker events
gameTickWorker.on('completed', () => {
  // Silent completion - logged in job itself
});

gameTickWorker.on('failed', (job, err) => {
  console.error(`Game tick job ${job?.id} failed:`, err);
});

gameTickWorker.on('error', (err) => {
  console.error('Game tick worker error:', err);
});

upkeepWorker.on('completed', () => {
  // Silent completion - logged in job itself
});

upkeepWorker.on('failed', (job, err) => {
  console.error(`Upkeep job ${job?.id} failed:`, err);
});

upkeepWorker.on('error', (err) => {
  console.error('Upkeep worker error:', err);
});

// Setup repeating jobs
async function setupRepeatingJobs(): Promise<void> {
  // Remove any existing repeating jobs from game tick queue
  const tickRepeatableJobs = await gameTickQueue.getRepeatableJobs();
  for (const job of tickRepeatableJobs) {
    await gameTickQueue.removeRepeatableByKey(job.key);
  }

  // Remove any existing repeating jobs from upkeep queue
  const upkeepRepeatableJobs = await upkeepQueue.getRepeatableJobs();
  for (const job of upkeepRepeatableJobs) {
    await upkeepQueue.removeRepeatableByKey(job.key);
  }

  // Add game tick repeating job (every 5 seconds)
  await gameTickQueue.add(
    'tick',
    {},
    {
      repeat: {
        every: config.game.tickInterval,
      },
    }
  );
  console.log(`Game tick job scheduled every ${config.game.tickInterval}ms`);

  // Add upkeep repeating job (every hour)
  const ONE_HOUR_MS = 60 * 60 * 1000;
  await upkeepQueue.add(
    'upkeep',
    {},
    {
      repeat: {
        every: ONE_HOUR_MS,
      },
    }
  );
  console.log('Upkeep job scheduled every hour');
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('Shutting down worker...');

  await gameTickWorker.close();
  await upkeepWorker.close();
  await gameTickQueue.close();
  await upkeepQueue.close();
  await redis.quit();
  await prisma.$disconnect();

  console.log('Worker shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start worker
async function main(): Promise<void> {
  console.log(`Nova Fall Worker v${VERSION} starting...`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Tick interval: ${config.game.tickInterval}ms`);

  try {
    // Test database connection
    await prisma.$connect();
    console.log('Database connected');

    // Setup repeating jobs
    await setupRepeatingJobs();

    console.log('Worker ready and processing jobs');
  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
}

main();
