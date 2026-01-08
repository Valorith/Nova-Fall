import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Redis } from 'ioredis';
import pino from 'pino';

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
        // Broadcast node update to all connected clients
        io.emit('node:update', data);
        break;

      case 'node:claimed':
        // Broadcast node claimed event
        io.emit('node:claimed', data);
        break;

      case 'battle:start':
        // Notify relevant players about battle
        io.emit('battle:start', data);
        break;

      case 'battle:update':
        // Broadcast battle state updates
        io.emit('battle:update', data);
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
        // Broadcast economy results (upkeep + income processed)
        io.emit('economy:processed', data);
        break;

      case 'transfer:completed':
        // Broadcast transfer completion to session
        if (data.sessionId) {
          io.to(`session:${data.sessionId}`).emit('transfer:completed', data);
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

  socket.on('disconnect', async (reason) => {
    // Decrement viewer count if socket was in a session
    const sessionId = socketSessions.get(socket.id);
    if (sessionId) {
      await decrementViewers(sessionId);
      socketSessions.delete(socket.id);
    }
    logger.info({ socketId: socket.id, reason, sessionId }, 'Client disconnected');
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

// Start server
httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, 'WebSocket server started');
});

export { io };
