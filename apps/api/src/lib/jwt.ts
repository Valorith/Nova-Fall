import { SignJWT, jwtVerify, type JWTPayload as JoseJWTPayload } from 'jose';
import { config } from '../config/index.js';

const secret = new TextEncoder().encode(config.session.secret);

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

export interface TokenPayload extends JoseJWTPayload {
  sub: string;
  email: string;
  type: 'access' | 'refresh';
}

export async function createAccessToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ email, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(secret);
}

export async function createRefreshToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ email, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(secret);
}

export async function createTokenPair(userId: string, email: string) {
  const [accessToken, refreshToken] = await Promise.all([
    createAccessToken(userId, email),
    createRefreshToken(userId, email),
  ]);
  return { accessToken, refreshToken };
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  const payload = await verifyToken(token);
  if (!payload || payload.type !== 'access') {
    return null;
  }
  return payload;
}

export async function verifyRefreshToken(token: string): Promise<TokenPayload | null> {
  const payload = await verifyToken(token);
  if (!payload || payload.type !== 'refresh') {
    return null;
  }
  return payload;
}
