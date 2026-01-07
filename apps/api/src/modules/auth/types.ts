export interface OAuthProfile {
  provider: 'discord' | 'google';
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
}

export interface ActiveSessionInfo {
  id: string;
  name: string;
  gameType: 'KING_OF_THE_HILL' | 'DOMINATION';
  status: 'LOBBY' | 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  role: 'PLAYER' | 'SPECTATOR';
  isCreator: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  isPremium: boolean;
  playerId: string | null;
  activeSession?: ActiveSessionInfo;
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
