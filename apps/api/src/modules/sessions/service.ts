import { prisma } from '../../lib/prisma.js';
import type { GameType, GameSessionStatus } from '@prisma/client';
import type {
  SessionListResponse,
  SessionDetailResponse,
  SessionPlayerResponse,
  ActiveSessionResponse,
  SessionListQuery,
} from './types.js';

// Get list of sessions (for lobby)
export async function getSessions(query: SessionListQuery): Promise<SessionListResponse[]> {
  const where: { status?: GameSessionStatus; gameType?: GameType } = {};

  if (query.status) where.status = query.status;
  if (query.gameType) where.gameType = query.gameType;

  const sessions = await prisma.gameSession.findMany({
    where,
    include: {
      players: {
        where: { role: 'PLAYER' },
        select: { id: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Get creator names
  const creatorIds = sessions.map((s) => s.creatorId);
  const creators = await prisma.player.findMany({
    where: { id: { in: creatorIds } },
    select: { id: true, displayName: true },
  });
  const creatorMap = new Map(creators.map((c) => [c.id, c.displayName]));

  return sessions.map((session) => ({
    id: session.id,
    name: session.name,
    gameType: session.gameType,
    status: session.status,
    playerCount: session.players.length,
    minPlayers: session.minPlayers,
    creatorId: session.creatorId,
    creatorName: creatorMap.get(session.creatorId) ?? 'Unknown',
    createdAt: session.createdAt.toISOString(),
    startedAt: session.startedAt?.toISOString() ?? null,
  }));
}

// Get session by ID with full details
export async function getSessionById(sessionId: string): Promise<SessionDetailResponse | null> {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: {
      players: {
        include: {
          player: {
            select: { displayName: true },
          },
        },
      },
    },
  });

  if (!session) return null;

  const players: SessionPlayerResponse[] = session.players.map((sp) => ({
    id: sp.id,
    playerId: sp.playerId,
    displayName: sp.player.displayName,
    role: sp.role,
    isCreator: sp.playerId === session.creatorId,
    hqNodeId: sp.hqNodeId,
    totalNodes: sp.totalNodes,
    eliminatedAt: sp.eliminatedAt?.toISOString() ?? null,
    joinedAt: sp.joinedAt.toISOString(),
  }));

  return {
    id: session.id,
    name: session.name,
    gameType: session.gameType,
    status: session.status,
    minPlayers: session.minPlayers,
    creatorId: session.creatorId,
    crownNodeId: session.crownNodeId,
    crownHolderId: session.crownHolderId,
    crownHeldSince: session.crownHeldSince?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    startedAt: session.startedAt?.toISOString() ?? null,
    endedAt: session.endedAt?.toISOString() ?? null,
    winnerId: session.winnerId,
    players,
  };
}

// Get player's active session
export async function getPlayerActiveSession(playerId: string): Promise<ActiveSessionResponse | null> {
  const sessionPlayer = await prisma.gameSessionPlayer.findFirst({
    where: {
      playerId,
      gameSession: {
        status: { in: ['LOBBY', 'ACTIVE'] },
      },
    },
    include: {
      gameSession: true,
    },
  });

  if (!sessionPlayer) return null;

  return {
    id: sessionPlayer.gameSession.id,
    name: sessionPlayer.gameSession.name,
    gameType: sessionPlayer.gameSession.gameType,
    status: sessionPlayer.gameSession.status,
    role: sessionPlayer.role,
    isCreator: sessionPlayer.playerId === sessionPlayer.gameSession.creatorId,
  };
}

// Create a new session
export async function createSession(
  playerId: string,
  name: string,
  gameType: GameType
): Promise<{ success: boolean; error?: string; session?: SessionDetailResponse }> {
  // Check if player already has an active session
  const existingSession = await getPlayerActiveSession(playerId);
  if (existingSession) {
    return { success: false, error: 'You already have an active game session' };
  }

  // Create session and add creator as first player
  const session = await prisma.gameSession.create({
    data: {
      name,
      gameType,
      creatorId: playerId,
      players: {
        create: {
          playerId,
          role: 'PLAYER',
        },
      },
    },
    include: {
      players: {
        include: {
          player: {
            select: { displayName: true },
          },
        },
      },
    },
  });

  const players: SessionPlayerResponse[] = session.players.map((sp) => ({
    id: sp.id,
    playerId: sp.playerId,
    displayName: sp.player.displayName,
    role: sp.role,
    isCreator: sp.playerId === session.creatorId,
    hqNodeId: sp.hqNodeId,
    totalNodes: sp.totalNodes,
    eliminatedAt: sp.eliminatedAt?.toISOString() ?? null,
    joinedAt: sp.joinedAt.toISOString(),
  }));

  return {
    success: true,
    session: {
      id: session.id,
      name: session.name,
      gameType: session.gameType,
      status: session.status,
      minPlayers: session.minPlayers,
      creatorId: session.creatorId,
      crownNodeId: session.crownNodeId,
      crownHolderId: session.crownHolderId,
      crownHeldSince: session.crownHeldSince?.toISOString() ?? null,
      createdAt: session.createdAt.toISOString(),
      startedAt: session.startedAt?.toISOString() ?? null,
      endedAt: session.endedAt?.toISOString() ?? null,
      winnerId: session.winnerId,
      players,
    },
  };
}

// Join a session as player
export async function joinSession(
  sessionId: string,
  playerId: string
): Promise<{ success: boolean; error?: string; session?: SessionDetailResponse }> {
  // Check if player already has an active session
  const existingSession = await getPlayerActiveSession(playerId);
  if (existingSession) {
    return { success: false, error: 'You already have an active game session' };
  }

  // Get session
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  if (session.status !== 'LOBBY') {
    return { success: false, error: 'Session is not open for joining' };
  }

  // Add player to session
  await prisma.gameSessionPlayer.create({
    data: {
      gameSessionId: sessionId,
      playerId,
      role: 'PLAYER',
    },
  });

  const updatedSession = await getSessionById(sessionId);
  if (!updatedSession) {
    return { success: false, error: 'Failed to retrieve session' };
  }
  return { success: true, session: updatedSession };
}

// Join a session as spectator
export async function spectateSession(
  sessionId: string,
  playerId: string
): Promise<{ success: boolean; error?: string; session?: SessionDetailResponse }> {
  // Spectators can watch even if they have an active game
  // But they can't spectate if already in this session
  const existingMembership = await prisma.gameSessionPlayer.findUnique({
    where: {
      gameSessionId_playerId: {
        gameSessionId: sessionId,
        playerId,
      },
    },
  });

  if (existingMembership) {
    return { success: false, error: 'You are already in this session' };
  }

  // Get session
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  // Can spectate any non-abandoned session
  if (session.status === 'ABANDONED') {
    return { success: false, error: 'Session has been abandoned' };
  }

  // Add player as spectator
  await prisma.gameSessionPlayer.create({
    data: {
      gameSessionId: sessionId,
      playerId,
      role: 'SPECTATOR',
    },
  });

  const updatedSession = await getSessionById(sessionId);
  if (!updatedSession) {
    return { success: false, error: 'Failed to retrieve session' };
  }
  return { success: true, session: updatedSession };
}

// Leave a session
export async function leaveSession(
  sessionId: string,
  playerId: string
): Promise<{ success: boolean; error?: string }> {
  // Get session and membership
  const membership = await prisma.gameSessionPlayer.findUnique({
    where: {
      gameSessionId_playerId: {
        gameSessionId: sessionId,
        playerId,
      },
    },
    include: {
      gameSession: true,
    },
  });

  if (!membership) {
    return { success: false, error: 'You are not in this session' };
  }

  const session = membership.gameSession;

  // Can't leave an active game as a player (only spectators)
  if (session.status === 'ACTIVE' && membership.role === 'PLAYER') {
    return { success: false, error: 'Cannot leave an active game as a player' };
  }

  // Remove player from session
  await prisma.gameSessionPlayer.delete({
    where: { id: membership.id },
  });

  // If this was the creator and we're still in lobby, handle session
  if (session.creatorId === playerId && session.status === 'LOBBY') {
    // Check if there are other players
    const remainingPlayers = await prisma.gameSessionPlayer.count({
      where: {
        gameSessionId: sessionId,
        role: 'PLAYER',
      },
    });

    if (remainingPlayers === 0) {
      // Abandon the session
      await prisma.gameSession.update({
        where: { id: sessionId },
        data: { status: 'ABANDONED', endedAt: new Date() },
      });
    }
    // Note: If there are remaining players, we could transfer creator role
    // but for MVP, just let the session continue
  }

  return { success: true };
}

// Start a game session (creator only, requires minPlayers)
export async function startSession(
  sessionId: string,
  playerId: string
): Promise<{ success: boolean; error?: string; session?: SessionDetailResponse }> {
  // Get session
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: {
      players: {
        where: { role: 'PLAYER' },
      },
    },
  });

  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  // Only creator can start
  if (session.creatorId !== playerId) {
    return { success: false, error: 'Only the session creator can start the game' };
  }

  // Must be in LOBBY status
  if (session.status !== 'LOBBY') {
    return { success: false, error: 'Session is not in lobby status' };
  }

  // Check minimum players
  if (session.players.length < session.minPlayers) {
    return {
      success: false,
      error: `Need at least ${session.minPlayers} players to start (currently ${session.players.length})`,
    };
  }

  // Start the session
  await prisma.gameSession.update({
    where: { id: sessionId },
    data: {
      status: 'ACTIVE',
      startedAt: new Date(),
    },
  });

  // TODO: Generate map nodes for this session
  // For now, the existing nodes have null gameSessionId which won't match

  const updatedSession = await getSessionById(sessionId);
  if (!updatedSession) {
    return { success: false, error: 'Failed to retrieve session' };
  }
  return { success: true, session: updatedSession };
}
