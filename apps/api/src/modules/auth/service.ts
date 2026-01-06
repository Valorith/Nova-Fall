import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { createTokenPair, verifyRefreshToken } from '../../lib/jwt.js';
import { publishNodeClaimed } from '../../lib/events.js';
import { NodeType, NodeStatus } from '@nova-fall/shared';
import type { OAuthProfile, AuthUser, TokenPair } from './types.js';

const REFRESH_TOKEN_PREFIX = 'refresh:';
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

// Find an unclaimed capital node for a new player's HQ
async function findAvailableHQ(): Promise<string | null> {
  // Find a CAPITAL node that isn't owned by anyone
  const availableCapital = await prisma.node.findFirst({
    where: {
      type: NodeType.CAPITAL,
      ownerId: null,
      status: NodeStatus.NEUTRAL,
    },
    orderBy: {
      // Order by position to assign in consistent order (top-left first)
      positionY: 'asc',
    },
  });

  return availableCapital?.id ?? null;
}

// Assign HQ to a player and claim the node
async function assignHQToPlayer(playerId: string, playerName: string, nodeId: string): Promise<void> {
  // Update both the player's hqNodeId and the node's ownership in a transaction
  await prisma.$transaction(async (tx) => {
    // Claim the node for the player
    await tx.node.update({
      where: { id: nodeId },
      data: {
        ownerId: playerId,
        status: NodeStatus.CLAIMED,
      },
    });

    // Set this as the player's HQ and increment node count
    await tx.player.update({
      where: { id: playerId },
      data: {
        hqNodeId: nodeId,
        totalNodes: 1,
      },
    });
  });

  // Publish the claim event for WebSocket broadcast
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
  });

  if (node) {
    await publishNodeClaimed({
      nodeId,
      node: {
        id: node.id,
        name: node.name,
        type: node.type,
        tier: node.tier,
        positionX: node.positionX,
        positionY: node.positionY,
        regionId: node.regionId,
        ownerId: playerId,
        status: NodeStatus.CLAIMED,
        ownerName: playerName,
      },
      playerId,
      playerName,
    });
  }
}

export async function findOrCreateUser(profile: OAuthProfile): Promise<AuthUser> {
  // Check if user exists with this OAuth provider
  let user = await prisma.user.findFirst({
    where: {
      oauthProvider: profile.provider,
      oauthId: profile.id,
    },
    include: {
      player: true,
    },
  });

  if (user) {
    // Check if existing player needs an HQ assigned
    if (user.player && !user.player.hqNodeId) {
      const availableHQId = await findAvailableHQ();
      if (availableHQId) {
        await assignHQToPlayer(user.player.id, user.player.displayName, availableHQId);
      }
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      avatarUrl: user.avatarUrl,
      isPremium: user.isPremium,
      playerId: user.player?.id ?? null,
    };
  }

  // Check if user exists with same email (account linking)
  user = await prisma.user.findUnique({
    where: { email: profile.email },
    include: { player: true },
  });

  if (user) {
    // Link this OAuth provider to existing account
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        oauthProvider: profile.provider,
        oauthId: profile.id,
        avatarUrl: profile.avatarUrl ?? user.avatarUrl,
      },
      include: { player: true },
    });

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      avatarUrl: user.avatarUrl,
      isPremium: user.isPremium,
      playerId: user.player?.id ?? null,
    };
  }

  // Find an available HQ before creating the player
  const availableHQId = await findAvailableHQ();

  // Create new user with player
  const newUser = await prisma.user.create({
    data: {
      email: profile.email,
      username: profile.username,
      oauthProvider: profile.provider,
      oauthId: profile.id,
      avatarUrl: profile.avatarUrl,
      player: {
        create: {
          displayName: profile.username,
          resources: {
            credits: 1000,
            iron: 100,
            energy: 50,
          },
        },
      },
    },
    include: { player: true },
  });

  // Assign HQ to the new player if one is available
  if (newUser.player && availableHQId) {
    await assignHQToPlayer(newUser.player.id, profile.username, availableHQId);
  }

  return {
    id: newUser.id,
    email: newUser.email,
    username: newUser.username,
    avatarUrl: newUser.avatarUrl,
    isPremium: newUser.isPremium,
    playerId: newUser.player?.id ?? null,
  };
}

export async function createSession(user: AuthUser): Promise<TokenPair> {
  const tokens = await createTokenPair(user.id, user.email);

  // Store refresh token in Redis for validation/revocation
  await redis.setex(
    REFRESH_TOKEN_PREFIX + user.id,
    REFRESH_TOKEN_TTL,
    tokens.refreshToken
  );

  return tokens;
}

export async function refreshSession(refreshToken: string): Promise<TokenPair | null> {
  const payload = await verifyRefreshToken(refreshToken);
  if (!payload || !payload.sub) {
    return null;
  }

  // Verify token matches stored token (prevents reuse of old tokens)
  const storedToken = await redis.get(REFRESH_TOKEN_PREFIX + payload.sub);
  if (storedToken !== refreshToken) {
    return null;
  }

  // Get user
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { player: true },
  });

  if (!user) {
    return null;
  }

  // Create new token pair (rotate refresh token)
  const tokens = await createTokenPair(user.id, user.email);

  // Store new refresh token
  await redis.setex(
    REFRESH_TOKEN_PREFIX + user.id,
    REFRESH_TOKEN_TTL,
    tokens.refreshToken
  );

  return tokens;
}

export async function revokeSession(userId: string): Promise<void> {
  await redis.del(REFRESH_TOKEN_PREFIX + userId);
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { player: true },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    avatarUrl: user.avatarUrl,
    isPremium: user.isPremium,
    playerId: user.player?.id ?? null,
  };
}

export async function updateUsername(userId: string, username: string): Promise<AuthUser> {
  // Check if username is taken
  const existing = await prisma.user.findUnique({
    where: { username },
  });

  if (existing && existing.id !== userId) {
    throw new Error('Username already taken');
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { username },
    include: { player: true },
  });

  // Also update player display name
  if (user.player) {
    await prisma.player.update({
      where: { id: user.player.id },
      data: { displayName: username },
    });
  }

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    avatarUrl: user.avatarUrl,
    isPremium: user.isPremium,
    playerId: user.player?.id ?? null,
  };
}
