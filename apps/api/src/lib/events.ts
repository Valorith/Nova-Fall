import { redis } from './redis.js';
import type { MapNodeResponse } from '../modules/nodes/types.js';

// Event types for real-time updates
export interface NodeUpdateEvent {
  nodeId: string;
  changes: Partial<MapNodeResponse>;
  sessionId: string; // Required for session-scoped routing
}

export interface NodeClaimedEvent {
  nodeId: string;
  node: MapNodeResponse;
  playerId: string;
  playerName: string;
  sessionId: string; // Required for session-scoped routing
}

export interface BattleStartEvent {
  battleId: string;
  nodeId: string;
  attackerId: string;
  defenderId: string | null;
  prepEndsAt: string;
  sessionId: string; // Required for session-scoped routing
}

export interface BattleUpdateEvent {
  battleId: string;
  status: string;
  data: Record<string, unknown>;
  sessionId: string; // Required for session-scoped routing
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

// Victory-related events (handled by worker for victory condition checks)
export interface CrownChangedEvent {
  sessionId: string;
  crownNodeId: string;
}

export interface HQCapturedEvent {
  sessionId: string;
  capturedHQNodeId: string;
  previousOwnerId: string;
  newOwnerId: string;
}

export async function publishCrownChanged(event: CrownChangedEvent): Promise<void> {
  await redis.publish('crown:changed', JSON.stringify(event));
}

export async function publishHQCaptured(event: HQCapturedEvent): Promise<void> {
  await redis.publish('hq:captured', JSON.stringify(event));
}
