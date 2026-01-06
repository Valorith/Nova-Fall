import { io, type Socket } from 'socket.io-client';
import type { MapNode } from '@nova-fall/shared';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3002';

// Event types from server
export interface NodeUpdateEvent {
  nodeId: string;
  changes: Partial<MapNode>;
}

export interface NodeClaimedEvent {
  nodeId: string;
  node: MapNode;
  playerId: string;
  playerName: string;
}

export interface BattleStartEvent {
  battleId: string;
  nodeId: string;
  attackerId: string;
  defenderId: string | null;
  prepEndsAt: string;
}

export interface BattleUpdateEvent {
  battleId: string;
  status: string;
  data: Record<string, unknown>;
}

// Socket event handlers
interface EventHandlers {
  'node:update': (event: NodeUpdateEvent) => void;
  'node:claimed': (event: NodeClaimedEvent) => void;
  'battle:start': (event: BattleStartEvent) => void;
  'battle:update': (event: BattleUpdateEvent) => void;
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (error: Error) => void;
}

class GameSocket {
  private socket: Socket | null = null;
  private handlers: Partial<EventHandlers> = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(): void {
    if (this.socket?.connected) return;

    this.socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.setupListeners();
  }

  private setupListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[Socket] Connected to WebSocket server');
      this.reconnectAttempts = 0;
      this.handlers.connect?.();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      this.handlers.disconnect?.(reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      this.reconnectAttempts++;
      this.handlers.connect_error?.(error);
    });

    // Game events
    this.socket.on('node:update', (data: NodeUpdateEvent) => {
      console.log('[Socket] Node update:', data.nodeId);
      this.handlers['node:update']?.(data);
    });

    this.socket.on('node:claimed', (data: NodeClaimedEvent) => {
      console.log('[Socket] Node claimed:', data.nodeId, 'by', data.playerName);
      this.handlers['node:claimed']?.(data);
    });

    this.socket.on('battle:start', (data: BattleStartEvent) => {
      console.log('[Socket] Battle started:', data.battleId);
      this.handlers['battle:start']?.(data);
    });

    this.socket.on('battle:update', (data: BattleUpdateEvent) => {
      console.log('[Socket] Battle update:', data.battleId, data.status);
      this.handlers['battle:update']?.(data);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Register event handlers
  on<K extends keyof EventHandlers>(event: K, handler: EventHandlers[K]): void {
    this.handlers[event] = handler;
  }

  off<K extends keyof EventHandlers>(event: K): void {
    this.handlers[event] = undefined;
  }

  // Subscribe to specific node updates
  subscribeToNode(nodeId: string): void {
    this.socket?.emit('subscribe:node', nodeId);
  }

  unsubscribeFromNode(nodeId: string): void {
    this.socket?.emit('unsubscribe:node', nodeId);
  }

  // Subscribe to battle updates
  subscribeToBattle(battleId: string): void {
    this.socket?.emit('subscribe:battle', battleId);
  }

  unsubscribeFromBattle(battleId: string): void {
    this.socket?.emit('unsubscribe:battle', battleId);
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

// Singleton instance
export const gameSocket = new GameSocket();
