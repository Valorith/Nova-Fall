import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import passport from 'passport';
import { createDiscordStrategy, createGoogleStrategy } from '../modules/auth/strategies/index.js';
import type { OAuthProfile } from '../modules/auth/types.js';

async function passportPlugin(fastify: FastifyInstance) {
  // Store profile temporarily during OAuth flow (keyed by state to handle concurrent requests)
  const pendingProfiles = new Map<string, OAuthProfile>();

  const handleVerify = async (profile: OAuthProfile) => {
    const key = profile.email;
    pendingProfiles.set(key, profile);

    // Clean up old profiles after 5 minutes
    setTimeout(() => pendingProfiles.delete(key), 5 * 60 * 1000);
  };

  // Register Discord strategy
  const discordStrategy = createDiscordStrategy(handleVerify);
  if (discordStrategy) {
    passport.use('discord', discordStrategy);
    fastify.log.info('Discord OAuth strategy registered');
  }

  // Register Google strategy
  const googleStrategy = createGoogleStrategy(handleVerify);
  if (googleStrategy) {
    passport.use('google', googleStrategy);
    fastify.log.info('Google OAuth strategy registered');
  }

  // Decorate fastify with helper to get pending profile by email
  fastify.decorate('getPendingOAuthProfile', (email: string) => {
    const profile = pendingProfiles.get(email);
    if (profile) {
      pendingProfiles.delete(email);
    }
    return profile ?? null;
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    getPendingOAuthProfile: (email: string) => OAuthProfile | null;
  }
}

export default fp(passportPlugin, {
  name: 'passport',
  dependencies: ['session'],
});
