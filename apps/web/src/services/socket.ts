import { io, type Socket } from 'socket.io-client';
import type { MapNode, ResourceStorage } from '@nova-fall/shared';

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

export interface ResourceUpdateItem {
  nodeId: string;
  storage: ResourceStorage;
  produced: ResourceStorage;
}

export interface ResourcesUpdateEvent {
  updates: ResourceUpdateItem[];
  tick: number;
}

export interface UpkeepTickEvent {
  nextUpkeepAt: number;
  upkeepInterval: number;
}

export interface NodeStorageUpdate {
  nodeId: string;
  storage: ResourceStorage;
}

export interface PlayerEconomyResult {
  playerId: string;
  sessionId: string;
  totalUpkeep: number;
  totalIncome: number;
  creditsBefore: number;
  creditsAfter: number;
  upkeepPaid: boolean;
  nodesProcessed: number;
  resourcesGenerated: ResourceStorage;
  nodeStorageUpdates?: NodeStorageUpdate[];
}

export interface EconomyProcessedEvent {
  type: 'economy:processed';
  results: PlayerEconomyResult[];
  timestamp: string;
}

export interface TransferCompletedEvent {
  transferId: string;
  playerId: string;
  sourceNodeId: string;
  destNodeId: string;
  status: 'COMPLETED' | 'CANCELLED';
  sessionId: string;
  sourceStorage?: Record<string, number>;
  destStorage?: Record<string, number>;
}

export interface VictoryEvent {
  sessionId: string;
  winnerId: string;
  winnerName: string;
  gameType: 'KING_OF_THE_HILL' | 'DOMINATION';
  reason: string;
}

export interface PlayerEliminatedEvent {
  sessionId: string;
  playerId: string;
  playerName: string;
  reason: string;
}

export interface CraftingQueueItemEvent {
  id: string;
  blueprintId: string;
  outputItemId?: string;
  quantity: number;
  completedRuns: number;
  timePerRun: number;
  startedAt: number;
  completesAt: number;
}

export interface CraftingCompletedEvent {
  nodeId: string;
  queueItemId: string;
  blueprintId: string;
  quantity: number;
  outputs: Record<string, number>;
  storage: Record<string, number>;
  queue: CraftingQueueItemEvent[];
  sessionId: string;
  playerId: string;
}

// Socket event handlers
interface EventHandlers {
  'node:update': (event: NodeUpdateEvent) => void;
  'node:claimed': (event: NodeClaimedEvent) => void;
  'battle:start': (event: BattleStartEvent) => void;
  'battle:update': (event: BattleUpdateEvent) => void;
  'resources:update': (event: ResourcesUpdateEvent) => void;
  'upkeep:tick': (event: UpkeepTickEvent) => void;
  'economy:processed': (event: EconomyProcessedEvent) => void;
  'transfer:completed': (event: TransferCompletedEvent) => void;
  'game:victory': (event: VictoryEvent) => void;
  'player:eliminated': (event: PlayerEliminatedEvent) => void;
  'crafting:completed': (event: CraftingCompletedEvent) => void;
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
      this.handlers['node:update']?.(data);
    });

    this.socket.on('node:claimed', (data: NodeClaimedEvent) => {
      this.handlers['node:claimed']?.(data);
    });

    this.socket.on('battle:start', (data: BattleStartEvent) => {
      this.handlers['battle:start']?.(data);
    });

    this.socket.on('battle:update', (data: BattleUpdateEvent) => {
      this.handlers['battle:update']?.(data);
    });

    this.socket.on('resources:update', (data: ResourcesUpdateEvent) => {
      this.handlers['resources:update']?.(data);
    });

    this.socket.on('upkeep:tick', (data: UpkeepTickEvent) => {
      this.handlers['upkeep:tick']?.(data);
    });

    this.socket.on('economy:processed', (data: EconomyProcessedEvent) => {
      this.handlers['economy:processed']?.(data);
    });

    this.socket.on('transfer:completed', (data: TransferCompletedEvent) => {
      this.handlers['transfer:completed']?.(data);
    });

    this.socket.on('game:victory', (data: VictoryEvent) => {
      this.handlers['game:victory']?.(data);
    });

    this.socket.on('player:eliminated', (data: PlayerEliminatedEvent) => {
      this.handlers['player:eliminated']?.(data);
    });

    this.socket.on('crafting:completed', (data: CraftingCompletedEvent) => {
      this.handlers['crafting:completed']?.(data);
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
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.handlers[event];
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

  // Join a game session (viewing the game board)
  joinSession(sessionId: string): void {
    this.socket?.emit('join:session', sessionId);
  }

  leaveSession(sessionId: string): void {
    this.socket?.emit('leave:session', sessionId);
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

// Singleton instance
export const gameSocket = new GameSocket();
