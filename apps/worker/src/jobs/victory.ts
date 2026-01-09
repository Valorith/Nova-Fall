import { Queue } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { redis, publisherRedis } from '../lib/redis.js';

// Victory conditions:
// - KOTH: Hold crown node for 48 hours continuously
// - Domination: Be the last player with an HQ

const KOTH_HOLD_DURATION_MS = 48 * 60 * 60 * 1000; // 48 hours
const VICTORY_QUEUE = 'victory';

// Victory queue for scheduling delayed KOTH jobs
const victoryQueue = new Queue(VICTORY_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
  },
});

export interface VictoryEvent {
  sessionId: string;
  winnerId: string;
  winnerName: string;
  gameType: 'KING_OF_THE_HILL' | 'DOMINATION';
  reason: string;
}

/**
 * Process a KOTH victory job (called by worker after 48h delay)
 * Verifies the expected holder still owns the crown and triggers victory
 */
export async function processKOTHVictory(
  sessionId: string,
  expectedHolderId: string
): Promise<boolean> {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: {
      players: {
        where: { role: 'PLAYER' },
        select: {
          playerId: true,
          isBot: true,
          botName: true,
          player: { select: { displayName: true } },
        },
      },
    },
  });

  if (!session || session.status !== 'ACTIVE') {
    console.log(`[Victory] Session ${sessionId} not active, skipping KOTH check`);
    return false;
  }

  // Verify the crown is still held by the expected holder
  if (session.crownHolderId !== expectedHolderId) {
    console.log(`[Victory] Crown holder changed, expected ${expectedHolderId} but found ${session.crownHolderId}`);
    return false;
  }

  // Verify they've held it for the full duration
  if (!session.crownHeldSince) {
    console.log(`[Victory] No crownHeldSince timestamp`);
    return false;
  }

  const holdDuration = Date.now() - session.crownHeldSince.getTime();
  if (holdDuration < KOTH_HOLD_DURATION_MS) {
    console.log(`[Victory] Hold duration ${holdDuration}ms < required ${KOTH_HOLD_DURATION_MS}ms`);
    return false;
  }

  // Find winner's name
  const winner = session.players.find((p) => p.playerId === expectedHolderId);
  const winnerName = winner?.player?.displayName ?? winner?.botName ?? 'Unknown';

  await processVictory({
    sessionId,
    winnerId: expectedHolderId,
    winnerName,
    gameType: 'KING_OF_THE_HILL',
    reason: 'Held the Crown for 48 hours',
  });

  return true;
}

/**
 * Schedule a KOTH victory job for 48 hours from now
 * Called when a player claims the crown node
 */
export async function scheduleKOTHVictory(
  sessionId: string,
  holderId: string
): Promise<void> {
  // First cancel any existing victory job for this session
  await cancelKOTHVictory(sessionId);

  // Schedule new victory job
  const jobId = `koth-${sessionId}`;
  await victoryQueue.add(
    'koth-victory',
    { sessionId, expectedHolderId: holderId },
    {
      delay: KOTH_HOLD_DURATION_MS,
      jobId,
    }
  );

  console.log(`[Victory] Scheduled KOTH victory for session ${sessionId}, holder ${holderId} in 48h`);
}

/**
 * Cancel any pending KOTH victory job for a session
 * Called when crown ownership changes
 */
export async function cancelKOTHVictory(sessionId: string): Promise<void> {
  const jobId = `koth-${sessionId}`;
  const job = await victoryQueue.getJob(jobId);
  if (job) {
    await job.remove();
    console.log(`[Victory] Cancelled pending KOTH victory for session ${sessionId}`);
  }
}

/**
 * Handle crown node ownership change
 * Updates session tracking and schedules/cancels victory jobs
 */
export async function handleCrownOwnershipChange(
  sessionId: string,
  crownNodeId: string
): Promise<void> {
  const crownNode = await prisma.node.findUnique({
    where: { id: crownNodeId },
    select: { ownerId: true },
  });

  if (!crownNode) return;

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    select: { crownHolderId: true, gameType: true, status: true },
  });

  if (!session || session.status !== 'ACTIVE') return;
  if (session.gameType !== 'KING_OF_THE_HILL') return;

  const newOwnerId = crownNode.ownerId;

  // Only update if owner actually changed
  if (newOwnerId === session.crownHolderId) return;

  // Update session tracking
  await prisma.gameSession.update({
    where: { id: sessionId },
    data: {
      crownHolderId: newOwnerId,
      crownHeldSince: newOwnerId ? new Date() : null,
    },
  });

  console.log(`[Victory] Crown ownership changed in session ${sessionId}: ${session.crownHolderId} -> ${newOwnerId}`);

  // Schedule or cancel victory job
  if (newOwnerId) {
    await scheduleKOTHVictory(sessionId, newOwnerId);
  } else {
    await cancelKOTHVictory(sessionId);
  }
}

/**
 * Check Domination victory condition
 * Called when an HQ is captured - checks if only one player remains
 */
export async function checkDominationVictory(sessionId: string): Promise<boolean> {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    select: { gameType: true, status: true },
  });

  if (!session || session.status !== 'ACTIVE') return false;
  if (session.gameType !== 'DOMINATION') return false;

  // Get all non-eliminated players in this session
  const activePlayers = await prisma.gameSessionPlayer.findMany({
    where: {
      gameSessionId: sessionId,
      role: 'PLAYER',
      eliminatedAt: null,
    },
    select: {
      id: true,
      playerId: true,
      hqNodeId: true,
      isBot: true,
      botName: true,
      player: { select: { displayName: true } },
    },
  });

  // Check which players still have their HQ
  const playersWithHQ: typeof activePlayers = [];

  for (const sessionPlayer of activePlayers) {
    if (!sessionPlayer.hqNodeId) continue;

    const hqNode = await prisma.node.findUnique({
      where: { id: sessionPlayer.hqNodeId },
      select: { ownerId: true },
    });

    // HQ is valid if still owned by this player
    if (hqNode && hqNode.ownerId === sessionPlayer.playerId) {
      playersWithHQ.push(sessionPlayer);
    } else if (hqNode && hqNode.ownerId !== sessionPlayer.playerId) {
      // This player lost their HQ - mark as eliminated
      await prisma.gameSessionPlayer.update({
        where: { id: sessionPlayer.id },
        data: { eliminatedAt: new Date() },
      });

      const eliminatedName = sessionPlayer.player?.displayName ?? sessionPlayer.botName ?? 'A player';
      console.log(`[Victory] ${eliminatedName} eliminated in session ${sessionId} (HQ captured)`);

      // Publish elimination event
      await publisherRedis.publish(
        'player:eliminated',
        JSON.stringify({
          sessionId,
          playerId: sessionPlayer.playerId,
          playerName: eliminatedName,
          reason: 'HQ captured',
        })
      );
    }
  }

  // Victory if only one player has HQ
  if (playersWithHQ.length === 1) {
    const winner = playersWithHQ[0]!;
    const winnerId = winner.playerId ?? winner.id;
    const winnerName = winner.player?.displayName ?? winner.botName ?? 'Unknown';

    await processVictory({
      sessionId,
      winnerId,
      winnerName,
      gameType: 'DOMINATION',
      reason: 'Last player standing with HQ',
    });

    return true;
  }

  return false;
}

/**
 * Process a victory: Update session, publish event
 */
async function processVictory(victory: VictoryEvent): Promise<void> {
  const now = new Date();

  // Update session status to COMPLETED
  await prisma.gameSession.update({
    where: { id: victory.sessionId },
    data: {
      status: 'COMPLETED',
      endedAt: now,
      winnerId: victory.winnerId,
    },
  });

  console.log(
    `[Victory] ${victory.winnerName} wins ${victory.gameType} in session ${victory.sessionId}: ${victory.reason}`
  );

  // Publish victory event for WebSocket
  await publisherRedis.publish('game:victory', JSON.stringify(victory));
}

// Export queue for external access if needed
export { victoryQueue };
