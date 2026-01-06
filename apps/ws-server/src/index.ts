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

// Subscribe to game event channels
redisSub.subscribe(
  'node:update',
  'node:claimed',
  'battle:start',
  'battle:update',
  'resources:update',
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

  socket.on('disconnect', (reason) => {
    logger.info({ socketId: socket.id, reason }, 'Client disconnected');
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  io.close();
  redisSub.quit();
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
