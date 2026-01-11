import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Redis } from 'ioredis';
import pino from 'pino';
import type { CombatInput, CombatSetup, CombatState, CombatResult } from '@nova-fall/shared';
import { COMBAT_EVENTS } from '@nova-fall/shared';

const loggerOptions: pino.LoggerOptions =
  process.env.NODE_ENV === 'development'
    ? {
        level: process.env.LOG_LEVEL || 'info',
        transport: {
          target: 'pino-pretty',
          options: { colorize: true },
        },
      }
    : {
        level: process.env.LOG_LEVEL || 'info',
      };

const logger = pino(loggerOptions);

const PORT = parseInt(process.env.PORT || '3002', 10);
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Create HTTP server
const httpServer = createServer();

// Create Socket.IO server
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN.split(','),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Redis subscriber for game events
const redisSub = new Redis(REDIS_URL);

// Redis client for read/write operations (viewer tracking)
const redis = new Redis(REDIS_URL);

// Track which session each socket is viewing
const socketSessions = new Map<string, string>();

// Track which battle each socket is in (for combat mode)
const socketBattles = new Map<string, string>();

// Track player ID for each socket (authenticated via API)
const socketPlayers = new Map<string, string>();

// Helper to get viewer count key
function getViewerKey(sessionId: string): string {
  return `session:${sessionId}:viewers`;
}

// Increment viewer count for a session
async function incrementViewers(sessionId: string): Promise<number> {
  const count = await redis.incr(getViewerKey(sessionId));
  logger.debug({ sessionId, count }, 'Viewer count incremented');
  return count;
}

// Decrement viewer count for a session
async function decrementViewers(sessionId: string): Promise<number> {
  const key = getViewerKey(sessionId);
  const count = await redis.decr(key);
  // Ensure count doesn't go negative
  if (count < 0) {
    await redis.set(key, '0');
    return 0;
  }
  logger.debug({ sessionId, count }, 'Viewer count decremented');
  return count;
}

// Subscribe to game event channels
redisSub.subscribe(
  'node:update',
  'node:claimed',
  'battle:start',
  'battle:update',
  'resources:update',
  'upkeep:tick',
  'economy:processed',
  'transfer:completed',
  'crafting:completed',
  'game:victory',
  'player:eliminated',
  // Combat channels
  'combat:setup',
  'combat:state',
  'combat:end',
  'combat:error',
  (err, count) => {
    if (err) {
      logger.error({ err }, 'Failed to subscribe to Redis channels');
      process.exit(1);
    }
    logger.info({ count }, 'Subscribed to Redis channels');
  }
);

// Handle Redis messages and broadcast to clients
redisSub.on('message', (channel, message) => {
  try {
    const data = JSON.parse(message);
    logger.debug({ channel, data }, 'Redis message received');

    switch (channel) {
      case 'node:update':
        // Broadcast node update to session room if sessionId provided
        if (data.sessionId) {
          io.to(`session:${data.sessionId}`).emit('node:update', data);
        } else {
          io.emit('node:update', data);
        }
        break;

      case 'node:claimed':
        // Broadcast node claimed event to session room
        if (data.sessionId) {
          io.to(`session:${data.sessionId}`).emit('node:claimed', data);
        } else {
          io.emit('node:claimed', data);
        }
        break;

      case 'battle:start':
        // Notify relevant players about battle in session
        if (data.sessionId) {
          io.to(`session:${data.sessionId}`).emit('battle:start', data);
        } else {
          io.emit('battle:start', data);
        }
        break;

      case 'battle:update':
        // Broadcast battle state updates to session
        if (data.sessionId) {
          io.to(`session:${data.sessionId}`).emit('battle:update', data);
        } else {
          io.emit('battle:update', data);
        }
        break;

      case 'resources:update':
        // Broadcast resource updates from game tick
        io.emit('resources:update', data);
        break;

      case 'upkeep:tick':
        // Broadcast upkeep timing for hourly progress bar
        io.emit('upkeep:tick', data);
        break;

      case 'economy:processed':
        // Broadcast economy results to each session
        // Group results by sessionId and emit to each session room
        if (data.results && Array.isArray(data.results)) {
          const resultsBySession = new Map<string, typeof data.results>();
          for (const result of data.results) {
            if (result.sessionId) {
              const existing = resultsBySession.get(result.sessionId) ?? [];
              existing.push(result);
              resultsBySession.set(result.sessionId, existing);
            }
          }
          // Emit to each session with only their relevant results
          for (const [sessionId, sessionResults] of resultsBySession) {
            io.to(`session:${sessionId}`).emit('economy:processed', {
              ...data,
              results: sessionResults,
            });
          }
        } else {
          // Fallback for events without sessionId
          io.emit('economy:processed', data);
        }
        break;

      case 'transfer:completed':
        // Broadcast transfer completion to session
        if (data.sessionId) {
          io.to(`session:${data.sessionId}`).emit('transfer:completed', data);
        }
        break;

      case 'crafting:completed':
        // Broadcast crafting completion to session
        if (data.sessionId) {
          io.to(`session:${data.sessionId}`).emit('crafting:completed', data);
          logger.debug({ sessionId: data.sessionId, nodeId: data.nodeId }, 'Crafting completed event broadcast');
        }
        break;

      case 'game:victory':
        // Broadcast victory event to session
        if (data.sessionId) {
          io.to(`session:${data.sessionId}`).emit('game:victory', data);
          logger.info({ sessionId: data.sessionId, winnerId: data.winnerId }, 'Victory event broadcast');
        }
        break;

      case 'player:eliminated':
        // Broadcast player elimination to session
        if (data.sessionId) {
          io.to(`session:${data.sessionId}`).emit('player:eliminated', data);
          logger.info({ sessionId: data.sessionId, playerId: data.playerId }, 'Player eliminated event broadcast');
        }
        break;

      // Combat events - broadcast to battle room
      case 'combat:setup':
        if (data.battleId) {
          io.to(`battle:${data.battleId}`).emit(COMBAT_EVENTS.COMBAT_SETUP, data as CombatSetup);
          logger.info({ battleId: data.battleId }, 'Combat setup broadcast');
        }
        break;

      case 'combat:state':
        if (data.battleId) {
          io.to(`battle:${data.battleId}`).emit(COMBAT_EVENTS.STATE_UPDATE, data as CombatState);
          // Don't log every state update to avoid spam (20 TPS)
        }
        break;

      case 'combat:end':
        if (data.battleId) {
          io.to(`battle:${data.battleId}`).emit(COMBAT_EVENTS.COMBAT_END, data as CombatResult);
          logger.info({ battleId: data.battleId, winnerId: data.winnerId }, 'Combat end broadcast');
        }
        break;

      case 'combat:error':
        if (data.battleId && data.playerId) {
          // Send error only to the specific player
          const targetSocket = [...io.sockets.sockets.values()].find(
            (s) => socketPlayers.get(s.id) === data.playerId && socketBattles.get(s.id) === data.battleId
          );
          if (targetSocket) {
            targetSocket.emit(COMBAT_EVENTS.COMBAT_ERROR, { message: data.message, code: data.code });
          }
        }
        break;

      default:
        logger.warn({ channel }, 'Unknown channel');
    }
  } catch (err) {
    logger.error({ err, message }, 'Failed to parse Redis message');
  }
});

// Handle client connections
io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'Client connected');

  // Client joins a game session (viewing the game board)
  socket.on('join:session', async (sessionId: string) => {
    // Leave previous session if any
    const previousSession = socketSessions.get(socket.id);
    if (previousSession && previousSession !== sessionId) {
      socket.leave(`session:${previousSession}`);
      await decrementViewers(previousSession);
    }

    // Join new session
    socket.join(`session:${sessionId}`);
    socketSessions.set(socket.id, sessionId);
    await incrementViewers(sessionId);
    logger.info({ socketId: socket.id, sessionId }, 'Client joined session');
  });

  socket.on('leave:session', async (sessionId: string) => {
    const currentSession = socketSessions.get(socket.id);
    if (currentSession === sessionId) {
      socket.leave(`session:${sessionId}`);
      socketSessions.delete(socket.id);
      await decrementViewers(sessionId);
      logger.info({ socketId: socket.id, sessionId }, 'Client left session');
    }
  });

  // Client can subscribe to specific node updates
  socket.on('subscribe:node', (nodeId: string) => {
    socket.join(`node:${nodeId}`);
    logger.debug({ socketId: socket.id, nodeId }, 'Client subscribed to node');
  });

  socket.on('unsubscribe:node', (nodeId: string) => {
    socket.leave(`node:${nodeId}`);
    logger.debug({ socketId: socket.id, nodeId }, 'Client unsubscribed from node');
  });

  // Client can subscribe to battle updates
  socket.on('subscribe:battle', (battleId: string) => {
    socket.join(`battle:${battleId}`);
    logger.debug({ socketId: socket.id, battleId }, 'Client subscribed to battle');
  });

  socket.on('unsubscribe:battle', (battleId: string) => {
    socket.leave(`battle:${battleId}`);
    logger.debug({ socketId: socket.id, battleId }, 'Client unsubscribed from battle');
  });

  // ============ Combat Mode Events ============

  // Authenticate socket with player ID (called after API auth)
  socket.on('auth:player', (playerId: string) => {
    socketPlayers.set(socket.id, playerId);
    logger.info({ socketId: socket.id, playerId }, 'Socket authenticated with player');
  });

  // Join a combat battle
  socket.on(COMBAT_EVENTS.JOIN_COMBAT, async (data: { battleId: string; playerId: string }) => {
    const { battleId, playerId } = data;

    // Store player ID if not already set
    if (!socketPlayers.has(socket.id)) {
      socketPlayers.set(socket.id, playerId);
    }

    // Leave previous battle if any
    const previousBattle = socketBattles.get(socket.id);
    if (previousBattle && previousBattle !== battleId) {
      socket.leave(`battle:${previousBattle}`);
      logger.debug({ socketId: socket.id, battleId: previousBattle }, 'Left previous battle');
    }

    // Join battle room
    socket.join(`battle:${battleId}`);
    socketBattles.set(socket.id, battleId);
    logger.info({ socketId: socket.id, battleId, playerId }, 'Player joined combat battle');

    // Publish join event to Redis for combat server to handle
    await redis.publish('combat:player_joined', JSON.stringify({ battleId, playerId, socketId: socket.id }));
  });

  // Leave a combat battle
  socket.on(COMBAT_EVENTS.LEAVE_COMBAT, async (data: { battleId: string }) => {
    const { battleId } = data;
    const playerId = socketPlayers.get(socket.id);

    if (socketBattles.get(socket.id) === battleId) {
      socket.leave(`battle:${battleId}`);
      socketBattles.delete(socket.id);
      logger.info({ socketId: socket.id, battleId, playerId }, 'Player left combat battle');

      // Publish leave event to Redis for combat server
      await redis.publish('combat:player_left', JSON.stringify({ battleId, playerId, socketId: socket.id }));
    }
  });

  // Send combat input (deploy, move, attack, ability)
  socket.on(COMBAT_EVENTS.SEND_INPUT, async (input: CombatInput) => {
    const battleId = socketBattles.get(socket.id);
    const playerId = socketPlayers.get(socket.id);

    if (!battleId || !playerId) {
      socket.emit(COMBAT_EVENTS.COMBAT_ERROR, { message: 'Not in a battle', code: 'NOT_IN_BATTLE' });
      return;
    }

    // Publish input to Redis for combat server to process
    await redis.publish('combat:input', JSON.stringify({
      battleId,
      playerId,
      input,
    }));

    logger.debug({ socketId: socket.id, battleId, playerId, type: input.type }, 'Combat input received');
  });

  // Request current combat state (for reconnection)
  socket.on(COMBAT_EVENTS.REQUEST_STATE, async (data: { battleId: string }) => {
    const { battleId } = data;
    const playerId = socketPlayers.get(socket.id);

    // Publish state request to Redis for combat server
    await redis.publish('combat:request_state', JSON.stringify({
      battleId,
      playerId,
      socketId: socket.id,
    }));

    logger.debug({ socketId: socket.id, battleId, playerId }, 'Combat state requested');
  });

  socket.on('disconnect', async (reason) => {
    // Decrement viewer count if socket was in a session
    const sessionId = socketSessions.get(socket.id);
    if (sessionId) {
      await decrementViewers(sessionId);
      socketSessions.delete(socket.id);
    }

    // Handle combat disconnect
    const battleId = socketBattles.get(socket.id);
    const playerId = socketPlayers.get(socket.id);
    if (battleId && playerId) {
      // Publish disconnect event for combat server
      await redis.publish('combat:player_disconnected', JSON.stringify({
        battleId,
        playerId,
        socketId: socket.id,
        reason,
      }));
      socketBattles.delete(socket.id);
    }
    socketPlayers.delete(socket.id);

    logger.info({ socketId: socket.id, reason, sessionId, battleId }, 'Client disconnected');
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  io.close();
  redisSub.quit();
  redis.quit();
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Clear stale viewer counts on startup (from previous server instances)
async function clearStaleViewerCounts(): Promise<void> {
  const pattern = 'session:*:viewers';
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
    logger.info({ count: keys.length }, 'Cleared stale viewer counts on startup');
  }
}

// Start server
clearStaleViewerCounts().then(() => {
  httpServer.listen(PORT, () => {
    logger.info({ port: PORT }, 'WebSocket server started');
  });
});

export { io };
