import { Queue, Worker } from 'bullmq';
import { redis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import { processUpkeep } from './jobs/upkeep.js';
import { processCompletedTransfers } from './jobs/transfers.js';

export const VERSION = '0.1.0';

// Queue names
const UPKEEP_QUEUE = 'upkeep';
const TRANSFERS_QUEUE = 'transfers';

// Create queues
const upkeepQueue = new Queue(UPKEEP_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

const transfersQueue = new Queue(TRANSFERS_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
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

const transfersWorker = new Worker(
  TRANSFERS_QUEUE,
  async () => {
    await processCompletedTransfers();
  },
  {
    connection: redis,
    concurrency: 1,
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

transfersWorker.on('failed', (job, err) => {
  console.error(`Transfers job ${job?.id} failed:`, err);
});

transfersWorker.on('error', (err) => {
  console.error('Transfers worker error:', err);
});

// Setup repeating jobs
async function setupRepeatingJobs(): Promise<void> {
  // Remove any existing repeating jobs from upkeep queue
  const upkeepRepeatableJobs = await upkeepQueue.getRepeatableJobs();
  for (const job of upkeepRepeatableJobs) {
    await upkeepQueue.removeRepeatableByKey(job.key);
  }

  // Remove any existing repeating jobs from transfers queue
  const transfersRepeatableJobs = await transfersQueue.getRepeatableJobs();
  for (const job of transfersRepeatableJobs) {
    await transfersQueue.removeRepeatableByKey(job.key);
  }

  // Run upkeep immediately on startup to initialize timer and process any pending work
  console.log('Running initial upkeep job...');
  await upkeepQueue.add('upkeep-init', {});

  // Run transfers immediately to process any pending transfers
  console.log('Running initial transfers job...');
  await transfersQueue.add('transfers-init', {});

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

  // Add transfers repeating job aligned to epoch boundaries
  // Both API and worker use epoch-based tick calculation, so they always agree
  const THIRTY_SECONDS_MS = 30 * 1000;
  const now = Date.now();
  const nextEpochTick = now + (THIRTY_SECONDS_MS - (now % THIRTY_SECONDS_MS));
  const delayUntilNextTick = nextEpochTick - now;

  // Schedule first job at the next epoch-aligned tick, then repeat every 30 seconds
  await transfersQueue.add(
    'transfers',
    {},
    {
      delay: delayUntilNextTick,
      repeat: {
        every: THIRTY_SECONDS_MS,
      },
    }
  );
  console.log(`Transfers job aligned to epoch (first tick in ${delayUntilNextTick}ms, then every 30s)`);
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('Shutting down worker...');

  await upkeepWorker.close();
  await transfersWorker.close();
  await upkeepQueue.close();
  await transfersQueue.close();
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
