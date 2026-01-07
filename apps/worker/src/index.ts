import { Queue, Worker } from 'bullmq';
import { redis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import { processUpkeep } from './jobs/upkeep.js';

export const VERSION = '0.1.0';

// Queue names
const UPKEEP_QUEUE = 'upkeep';

// Create queues
const upkeepQueue = new Queue(UPKEEP_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

// Create workers
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
  // Remove any existing repeating jobs from upkeep queue
  const upkeepRepeatableJobs = await upkeepQueue.getRepeatableJobs();
  for (const job of upkeepRepeatableJobs) {
    await upkeepQueue.removeRepeatableByKey(job.key);
  }

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

  await upkeepWorker.close();
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
  console.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);

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
