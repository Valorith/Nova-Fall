import type { GameType, GameSessionStatus, SessionRole, BotDifficulty } from '@prisma/client';

// Session data for lobby display
export interface SessionListResponse {
  id: string;
  name: string;
  gameType: GameType;
  status: GameSessionStatus;
  playerCount: number;   // Total players (humans + bots)
  humanCount: number;    // Human players only
  botCount: number;      // Bot players only
  activeViewers: number; // Players currently viewing the game board
  minPlayers: number;
  maxPlayers: number;
  creatorId: string;
  creatorName: string;
  createdAt: string;
  startedAt: string | null;
}

// Session player info (can be human or bot)
export interface SessionPlayerResponse {
  id: string;
  playerId: string | null;  // null for bots
  displayName: string;
  role: SessionRole;
  isCreator: boolean;
  isBot: boolean;
  botDifficulty: BotDifficulty | null;
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
  maxPlayers: number;
  creatorId: string;
  crownNodeId: string | null;
  crownHolderId: string | null;
  crownHeldSince: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  winnerId: string | null;
  activeViewers: number;
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

// Request for adding a bot to a session
export interface AddBotRequest {
  name?: string;  // Optional custom name, defaults to "Bot 1", "Bot 2", etc.
  difficulty?: BotDifficulty;  // Optional difficulty, defaults to NORMAL
}
