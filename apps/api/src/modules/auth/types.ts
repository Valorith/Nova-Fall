export interface OAuthProfile {
  provider: 'discord' | 'google';
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  isPremium: boolean;
  playerId: string | null;
}

export interface JWTPayload {
  sub: string; // user id
  email: string;
  iat: number;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
