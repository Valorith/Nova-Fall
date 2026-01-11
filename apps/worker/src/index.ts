import { Queue, Worker } from 'bullmq';
import { redis, subscriberRedis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import { processUpkeep } from './jobs/upkeep.js';
import { processCompletedTransfers } from './jobs/transfers.js';
import { processKOTHVictory, handleCrownOwnershipChange, checkDominationVictory } from './jobs/victory.js';
import { processCompletedCrafts, CRAFTING_JOB_INTERVAL_MS } from './jobs/crafting.js';

export const VERSION = '0.1.0';

// Queue names
const UPKEEP_QUEUE = 'upkeep';
const TRANSFERS_QUEUE = 'transfers';
const VICTORY_QUEUE = 'victory';
const CRAFTING_QUEUE = 'crafting';

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

const victoryQueue = new Queue(VICTORY_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
  },
});

const craftingQueue = new Queue(CRAFTING_QUEUE, {
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

// Victory worker processes delayed KOTH victory jobs
// Jobs are scheduled 48h after a player claims the crown
const victoryWorker = new Worker(
  VICTORY_QUEUE,
  async (job) => {
    if (job.name === 'koth-victory') {
      await processKOTHVictory(job.data.sessionId, job.data.expectedHolderId);
    }
  },
  {
    connection: redis,
    concurrency: 1,
  }
);

// Crafting worker processes completed crafts
// Handles both polling jobs and delayed scheduled jobs
const craftingWorker = new Worker(
  CRAFTING_QUEUE,
  async (job) => {
    if (job.name === 'crafting-scheduled' && job.data.nodeId) {
      // Scheduled job for a specific node - process just that node
      await processCompletedCrafts(job.data.nodeId);
    } else {
      // Polling job - process all due crafts
      await processCompletedCrafts();
    }
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

victoryWorker.on('failed', (job, err) => {
  console.error(`Victory job ${job?.id} failed:`, err);
});

victoryWorker.on('error', (err) => {
  console.error('Victory worker error:', err);
});

craftingWorker.on('failed', (job, err) => {
  console.error(`Crafting job ${job?.id} failed:`, err);
});

craftingWorker.on('error', (err) => {
  console.error('Crafting worker error:', err);
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

  // Remove any existing repeating jobs from victory queue (legacy cleanup)
  const victoryRepeatableJobs = await victoryQueue.getRepeatableJobs();
  for (const job of victoryRepeatableJobs) {
    await victoryQueue.removeRepeatableByKey(job.key);
  }
  // Note: Victory queue now only processes delayed KOTH jobs (scheduled by API)

  // Remove any existing repeating jobs from crafting queue
  const craftingRepeatableJobs = await craftingQueue.getRepeatableJobs();
  for (const job of craftingRepeatableJobs) {
    await craftingQueue.removeRepeatableByKey(job.key);
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

  // Run crafting immediately to process any pending crafts
  console.log('Running initial crafting job...');
  await craftingQueue.add('crafting-init', {});

  // Add crafting repeating job (every 30 seconds, aligned to epoch like transfers)
  await craftingQueue.add(
    'crafting',
    {},
    {
      delay: delayUntilNextTick,
      repeat: {
        every: CRAFTING_JOB_INTERVAL_MS,
      },
    }
  );
  console.log(`Crafting job aligned to epoch (first tick in ${delayUntilNextTick}ms, then every 30s)`);
}

// Setup victory event subscriptions
async function setupVictoryEventSubscription(): Promise<void> {
  // Subscribe to victory-related events from API
  await subscriberRedis.subscribe('crown:changed', 'hq:captured', 'crafting:schedule');

  subscriberRedis.on('message', async (channel, message) => {
    try {
      const data = JSON.parse(message);

      switch (channel) {
        case 'crown:changed':
          // Crown node ownership changed - update tracking and schedule/cancel victory
          await handleCrownOwnershipChange(data.sessionId, data.crownNodeId);
          break;

        case 'hq:captured':
          // HQ was captured - check if game is over (Domination)
          await checkDominationVictory(data.sessionId);
          break;

        case 'crafting:schedule':
          // Schedule a delayed crafting job for a specific node
          if (data.nodeId && typeof data.delay === 'number') {
            await craftingQueue.add(
              'crafting-scheduled',
              { nodeId: data.nodeId },
              { delay: Math.max(0, data.delay) }
            );
            console.log(`[Worker] Scheduled crafting job for ${data.nodeId} in ${data.delay}ms`);
          }
          break;
      }
    } catch (err) {
      console.error(`[Worker] Error handling ${channel} event:`, err);
    }
  });

  console.log('Victory and crafting event subscriptions active');
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('Shutting down worker...');

  await upkeepWorker.close();
  await transfersWorker.close();
  await victoryWorker.close();
  await craftingWorker.close();
  await upkeepQueue.close();
  await transfersQueue.close();
  await victoryQueue.close();
  await craftingQueue.close();
  await subscriberRedis.quit();
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

    // Setup victory event subscriptions
    await setupVictoryEventSubscription();

    console.log('Worker ready and processing jobs');
  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
}

main();
