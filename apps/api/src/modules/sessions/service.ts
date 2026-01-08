import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import type { GameType, GameSessionStatus, BotDifficulty } from '@prisma/client';
import { STARTING_NODE_RESOURCES } from '@nova-fall/shared';
import type {
  SessionListResponse,
  SessionDetailResponse,
  SessionPlayerResponse,
  ActiveSessionResponse,
  SessionListQuery,
} from './types.js';

// Helper to get viewer count for a session
async function getViewerCount(sessionId: string): Promise<number> {
  const count = await redis.get(`session:${sessionId}:viewers`);
  return parseInt(count ?? '0', 10);
}

// Bot name generator
const BOT_NAMES = [
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon',
  'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa',
  'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron',
];

function generateBotName(existingBotCount: number): string {
  const index = existingBotCount % BOT_NAMES.length;
  const suffix = existingBotCount >= BOT_NAMES.length
    ? ` ${Math.floor(existingBotCount / BOT_NAMES.length) + 1}`
    : '';
  return `Bot ${BOT_NAMES[index]}${suffix}`;
}

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
        select: { id: true, isBot: true },
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

  // Get viewer counts for all sessions
  const viewerCounts = await Promise.all(
    sessions.map((s) => getViewerCount(s.id))
  );

  return sessions.map((session, index) => {
    const humanCount = session.players.filter((p) => !p.isBot).length;
    const botCount = session.players.filter((p) => p.isBot).length;

    return {
      id: session.id,
      name: session.name,
      gameType: session.gameType,
      status: session.status,
      playerCount: session.players.length,
      humanCount,
      botCount,
      activeViewers: viewerCounts[index] ?? 0,
      minPlayers: session.minPlayers,
      maxPlayers: session.maxPlayers,
      creatorId: session.creatorId,
      creatorName: creatorMap.get(session.creatorId) ?? 'Unknown',
      createdAt: session.createdAt.toISOString(),
      startedAt: session.startedAt?.toISOString() ?? null,
    };
  });
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

  const activeViewers = await getViewerCount(sessionId);

  const players: SessionPlayerResponse[] = session.players.map((sp) => ({
    id: sp.id,
    playerId: sp.playerId,
    displayName: sp.isBot ? (sp.botName ?? 'Bot') : (sp.player?.displayName ?? 'Unknown'),
    role: sp.role,
    isCreator: sp.playerId === session.creatorId,
    isBot: sp.isBot,
    botDifficulty: sp.botDifficulty,
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
    maxPlayers: session.maxPlayers,
    creatorId: session.creatorId,
    crownNodeId: session.crownNodeId,
    crownHolderId: session.crownHolderId,
    crownHeldSince: session.crownHeldSince?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    startedAt: session.startedAt?.toISOString() ?? null,
    endedAt: session.endedAt?.toISOString() ?? null,
    winnerId: session.winnerId,
    activeViewers,
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
          isBot: false,
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
    displayName: sp.isBot ? (sp.botName ?? 'Bot') : (sp.player?.displayName ?? 'Unknown'),
    role: sp.role,
    isCreator: sp.playerId === session.creatorId,
    isBot: sp.isBot,
    botDifficulty: sp.botDifficulty,
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
      maxPlayers: session.maxPlayers,
      creatorId: session.creatorId,
      crownNodeId: session.crownNodeId,
      crownHolderId: session.crownHolderId,
      crownHeldSince: session.crownHeldSince?.toISOString() ?? null,
      createdAt: session.createdAt.toISOString(),
      startedAt: session.startedAt?.toISOString() ?? null,
      endedAt: session.endedAt?.toISOString() ?? null,
      winnerId: session.winnerId,
      activeViewers: 0, // New session has no viewers yet
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

  // Get session with player count
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: {
      players: {
        where: { role: 'PLAYER' },
        select: { id: true },
      },
    },
  });

  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  if (session.status !== 'LOBBY') {
    return { success: false, error: 'Session is not open for joining' };
  }

  // Check if session is full
  if (session.players.length >= session.maxPlayers) {
    return { success: false, error: 'Session is full' };
  }

  // Add player to session
  await prisma.gameSessionPlayer.create({
    data: {
      gameSessionId: sessionId,
      playerId,
      role: 'PLAYER',
      isBot: false,
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
  // Get session with players
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: {
      players: {
        where: { role: 'PLAYER' },
        orderBy: { joinedAt: 'asc' }, // Order by join time for HQ assignment
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

  // Find available nodes (not assigned to any session)
  const availableNodes = await prisma.node.findMany({
    where: { gameSessionId: null },
    orderBy: [{ type: 'asc' }, { positionX: 'asc' }, { positionY: 'asc' }],
  });

  if (availableNodes.length === 0) {
    return { success: false, error: 'No map nodes available. Please seed the database.' };
  }

  // Find CAPITAL nodes for player starting positions (corners)
  const capitalNodes = availableNodes.filter((n) => n.type === 'CAPITAL');

  if (capitalNodes.length < session.players.length) {
    return {
      success: false,
      error: `Not enough starting positions. Need ${session.players.length} capitals, found ${capitalNodes.length}`,
    };
  }

  // Identify corners by splitting into top/bottom halves, then left/right within each
  // This handles hex grid stagger where corners may have slightly different Y values
  let selectedCapitals: typeof capitalNodes;
  const playerCount = session.players.length;

  if (playerCount === 2 && capitalNodes.length >= 4) {
    // Find median Y to split into top and bottom halves
    const sortedByY = [...capitalNodes].sort((a, b) => a.positionY - b.positionY);
    const secondNode = sortedByY[1];
    const thirdNode = sortedByY[2];

    if (secondNode && thirdNode) {
      const medianY = (secondNode.positionY + thirdNode.positionY) / 2;

      // Split into top half (smaller Y) and bottom half (larger Y)
      const topHalf = capitalNodes.filter(n => n.positionY < medianY);
      const bottomHalf = capitalNodes.filter(n => n.positionY >= medianY);

      if (topHalf.length >= 2 && bottomHalf.length >= 2) {
        // Within each half, find left (min X) and right (max X)
        const topLeft = topHalf.reduce((a, b) => a.positionX < b.positionX ? a : b);
        const topRight = topHalf.reduce((a, b) => a.positionX > b.positionX ? a : b);
        const bottomLeft = bottomHalf.reduce((a, b) => a.positionX < b.positionX ? a : b);
        const bottomRight = bottomHalf.reduce((a, b) => a.positionX > b.positionX ? a : b);

        // Choose a diagonal randomly (TL+BR or TR+BL)
        const useFirstDiagonal = Math.random() < 0.5;
        const cornerA = useFirstDiagonal ? topLeft : topRight;
        const cornerB = useFirstDiagonal ? bottomRight : bottomLeft;
        // Randomize which player gets which corner
        const swapPositions = Math.random() < 0.5;
        selectedCapitals = swapPositions ? [cornerB, cornerA] : [cornerA, cornerB];
      } else {
        // Fallback: just take first two capitals
        selectedCapitals = capitalNodes.slice(0, playerCount);
      }
    } else {
      // Fallback: just take first two capitals
      selectedCapitals = capitalNodes.slice(0, playerCount);
    }
  } else {
    // For 3+ players: shuffle all corners randomly (Fisher-Yates shuffle)
    selectedCapitals = [...capitalNodes];
    for (let i = selectedCapitals.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = selectedCapitals[i];
      const swapItem = selectedCapitals[j];
      if (temp && swapItem) {
        selectedCapitals[i] = swapItem;
        selectedCapitals[j] = temp;
      }
    }
  }

  // Assign all nodes to this session and reset to neutral state
  await prisma.node.updateMany({
    where: { id: { in: availableNodes.map((n) => n.id) } },
    data: {
      gameSessionId: sessionId,
      status: 'NEUTRAL',
      ownerId: null,
      claimedAt: null,
      upkeepPaid: null,
      upkeepDue: null,
      upkeepStatus: 'PAID',
    },
  });

  // For KOTH games, find the central node and set it as the crown
  let crownNodeId: string | null = null;
  if (session.gameType === 'KING_OF_THE_HILL') {
    // Calculate the center of the map based on all node positions
    const allX = availableNodes.map((n) => n.positionX);
    const allY = availableNodes.map((n) => n.positionY);
    const centerX = (Math.min(...allX) + Math.max(...allX)) / 2;
    const centerY = (Math.min(...allY) + Math.max(...allY)) / 2;

    // Find the node closest to the center (excluding capitals)
    let closestNode = availableNodes[0];
    let closestDistance = Infinity;

    for (const node of availableNodes) {
      // Skip capital nodes - crown should be a contestable node
      // Also skip any leftover CROWN nodes from previous sessions
      if (node.type === 'CAPITAL' || node.type === 'CROWN') continue;

      const distance = Math.sqrt(
        Math.pow(node.positionX - centerX, 2) + Math.pow(node.positionY - centerY, 2)
      );
      if (distance < closestDistance) {
        closestDistance = distance;
        closestNode = node;
      }
    }

    if (closestNode) {
      crownNodeId = closestNode.id;

      // Convert the selected node to a CROWN type with special name
      await prisma.node.update({
        where: { id: crownNodeId },
        data: {
          type: 'CROWN',
          name: 'Game Objective',
          tier: 3, // High tier for importance
        },
      });
    }
  }

  // Assign HQ nodes to players and claim them
  for (let i = 0; i < session.players.length; i++) {
    const sessionPlayer = session.players[i];
    const hqNode = selectedCapitals[i];

    if (!sessionPlayer || !hqNode) {
      continue; // Should not happen given earlier checks
    }

    let ownerId = sessionPlayer.playerId;

    // For bots, create a Player record so they can own nodes
    if (sessionPlayer.isBot && !ownerId) {
      const botPlayer = await prisma.player.create({
        data: {
          displayName: sessionPlayer.botName ?? 'Bot',
          isBot: true,
          totalNodes: 0,
        },
      });
      ownerId = botPlayer.id;

      // Link the bot session player to this player record
      await prisma.gameSessionPlayer.update({
        where: { id: sessionPlayer.id },
        data: { playerId: ownerId },
      });
    }

    // Update session player with HQ
    await prisma.gameSessionPlayer.update({
      where: { id: sessionPlayer.id },
      data: {
        hqNodeId: hqNode.id,
        totalNodes: 1,
      },
    });

    // Claim the HQ node for the player/bot and set starting resources in storage
    if (ownerId) {
      await prisma.node.update({
        where: { id: hqNode.id },
        data: {
          ownerId: ownerId,
          status: 'CLAIMED',
          claimedAt: new Date(),
          storage: STARTING_NODE_RESOURCES, // Iron, energy etc. stored in HQ
        },
      });

      // Update player stats
      await prisma.player.update({
        where: { id: ownerId },
        data: {
          totalNodes: { increment: 1 },
        },
      });
    }
  }

  // Start the session
  await prisma.gameSession.update({
    where: { id: sessionId },
    data: {
      status: 'ACTIVE',
      startedAt: new Date(),
      crownNodeId: crownNodeId, // Set crown node for KOTH games (null for other game types)
    },
  });

  const updatedSession = await getSessionById(sessionId);
  if (!updatedSession) {
    return { success: false, error: 'Failed to retrieve session' };
  }
  return { success: true, session: updatedSession };
}

// Add a bot to a session (creator only)
export async function addBot(
  sessionId: string,
  playerId: string,
  botName?: string,
  difficulty: BotDifficulty = 'NORMAL'
): Promise<{ success: boolean; error?: string; session?: SessionDetailResponse }> {
  // Get session with player count
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: {
      players: {
        where: { role: 'PLAYER' },
        select: { id: true, isBot: true },
      },
    },
  });

  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  // Only creator can add bots
  if (session.creatorId !== playerId) {
    return { success: false, error: 'Only the session creator can add bots' };
  }

  // Must be in LOBBY status
  if (session.status !== 'LOBBY') {
    return { success: false, error: 'Can only add bots in lobby' };
  }

  // Check if session is full
  if (session.players.length >= session.maxPlayers) {
    return { success: false, error: 'Session is full' };
  }

  // Generate bot name if not provided
  const existingBotCount = session.players.filter((p) => p.isBot).length;
  const finalBotName = botName || generateBotName(existingBotCount);

  // Add bot to session
  await prisma.gameSessionPlayer.create({
    data: {
      gameSessionId: sessionId,
      playerId: null,  // Bots don't have a real player ID
      role: 'PLAYER',
      isBot: true,
      botName: finalBotName,
      botDifficulty: difficulty,
    },
  });

  const updatedSession = await getSessionById(sessionId);
  if (!updatedSession) {
    return { success: false, error: 'Failed to retrieve session' };
  }
  return { success: true, session: updatedSession };
}

// Remove a bot from a session (creator only)
export async function removeBot(
  sessionId: string,
  playerId: string,
  botId: string
): Promise<{ success: boolean; error?: string; session?: SessionDetailResponse }> {
  // Get session
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  // Only creator can remove bots
  if (session.creatorId !== playerId) {
    return { success: false, error: 'Only the session creator can remove bots' };
  }

  // Must be in LOBBY status
  if (session.status !== 'LOBBY') {
    return { success: false, error: 'Can only remove bots in lobby' };
  }

  // Get the bot
  const bot = await prisma.gameSessionPlayer.findUnique({
    where: { id: botId },
  });

  if (!bot) {
    return { success: false, error: 'Bot not found' };
  }

  if (bot.gameSessionId !== sessionId) {
    return { success: false, error: 'Bot is not in this session' };
  }

  if (!bot.isBot) {
    return { success: false, error: 'Cannot remove a human player using this endpoint' };
  }

  // Remove the bot
  await prisma.gameSessionPlayer.delete({
    where: { id: botId },
  });

  const updatedSession = await getSessionById(sessionId);
  if (!updatedSession) {
    return { success: false, error: 'Failed to retrieve session' };
  }
  return { success: true, session: updatedSession };
}

// End a game session early (creator only)
export async function endSession(
  sessionId: string,
  playerId: string
): Promise<{ success: boolean; error?: string }> {
  // Get session
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  // Only creator can end the session
  if (session.creatorId !== playerId) {
    return { success: false, error: 'Only the session creator can end the game' };
  }

  // Can only end LOBBY or ACTIVE sessions
  if (session.status !== 'LOBBY' && session.status !== 'ACTIVE') {
    return { success: false, error: 'Session is already ended' };
  }

  // Reset CROWN nodes back to TRADE_HUB type (they were converted during game start)
  await prisma.node.updateMany({
    where: { gameSessionId: sessionId, type: 'CROWN' },
    data: {
      type: 'TRADE_HUB',
      name: 'Trade Hub', // Reset name from "Game Objective"
      tier: 2,
    },
  });

  // Release all nodes assigned to this session
  await prisma.node.updateMany({
    where: { gameSessionId: sessionId },
    data: {
      gameSessionId: null,
      ownerId: null,
      status: 'NEUTRAL',
      claimedAt: null,
      upkeepPaid: null,
      upkeepDue: null,
    },
  });

  // Reset player stats for session players
  const sessionPlayers = await prisma.gameSessionPlayer.findMany({
    where: { gameSessionId: sessionId, playerId: { not: null } },
    select: { playerId: true, totalNodes: true },
  });

  for (const sp of sessionPlayers) {
    if (sp.playerId) {
      await prisma.player.update({
        where: { id: sp.playerId },
        data: {
          totalNodes: { decrement: sp.totalNodes },
        },
      });
    }
  }

  // Mark session as abandoned
  await prisma.gameSession.update({
    where: { id: sessionId },
    data: {
      status: 'ABANDONED',
      endedAt: new Date(),
    },
  });

  return { success: true };
}
