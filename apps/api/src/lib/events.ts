import { redis } from './redis.js';
import type { MapNodeResponse } from '../modules/nodes/types.js';

// Event types for real-time updates
export interface NodeUpdateEvent {
  nodeId: string;
  changes: Partial<MapNodeResponse>;
}

export interface NodeClaimedEvent {
  nodeId: string;
  node: MapNodeResponse;
  playerId: string;
  playerName: string;
  sessionId?: string; // Game session ID for session-scoped events
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

// Publish functions
export async function publishNodeUpdate(event: NodeUpdateEvent): Promise<void> {
  await redis.publish('node:update', JSON.stringify(event));
}

export async function publishNodeClaimed(event: NodeClaimedEvent): Promise<void> {
  await redis.publish('node:claimed', JSON.stringify(event));
}

export async function publishBattleStart(event: BattleStartEvent): Promise<void> {
  await redis.publish('battle:start', JSON.stringify(event));
}

export async function publishBattleUpdate(event: BattleUpdateEvent): Promise<void> {
  await redis.publish('battle:update', JSON.stringify(event));
}
