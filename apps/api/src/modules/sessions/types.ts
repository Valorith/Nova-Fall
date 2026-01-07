import type { GameType, GameSessionStatus, SessionRole } from '@prisma/client';

// Session data for lobby display
export interface SessionListResponse {
  id: string;
  name: string;
  gameType: GameType;
  status: GameSessionStatus;
  playerCount: number;
  minPlayers: number;
  creatorId: string;
  creatorName: string;
  createdAt: string;
  startedAt: string | null;
}

// Session player info
export interface SessionPlayerResponse {
  id: string;
  playerId: string;
  displayName: string;
  role: SessionRole;
  isCreator: boolean;
  hqNodeId: string | null;
  totalNodes: number;
  eliminatedAt: string | null;
  joinedAt: string;
}

// Full session details
export interface SessionDetailResponse {
  id: string;
  name: string;
  gameType: GameType;
  status: GameSessionStatus;
  minPlayers: number;
  creatorId: string;
  crownNodeId: string | null;
  crownHolderId: string | null;
  crownHeldSince: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  winnerId: string | null;
  players: SessionPlayerResponse[];
}

// User's active session info (for /me endpoint)
export interface ActiveSessionResponse {
  id: string;
  name: string;
  gameType: GameType;
  status: GameSessionStatus;
  role: SessionRole;
  isCreator: boolean;
}

// Request types
export interface CreateSessionRequest {
  name: string;
  gameType: GameType;
}

export interface SessionListQuery {
  status?: GameSessionStatus;
  gameType?: GameType;
}
