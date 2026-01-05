import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { createTokenPair, verifyRefreshToken } from '../../lib/jwt.js';
import type { OAuthProfile, AuthUser, TokenPair } from './types.js';

const REFRESH_TOKEN_PREFIX = 'refresh:';
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

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
