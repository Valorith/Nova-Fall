import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import passport from 'passport';
import { createDiscordStrategy, createGoogleStrategy } from '../modules/auth/strategies/index.js';
import type { OAuthProfile } from '../modules/auth/types.js';

async function passportPlugin(fastify: FastifyInstance) {
  // Store profile temporarily during OAuth flow
  let pendingProfile: OAuthProfile | null = null;

  const handleVerify = async (profile: OAuthProfile) => {
    pendingProfile = profile;
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

  // Decorate fastify with helper to get pending profile
  fastify.decorate('getPendingOAuthProfile', () => {
    const profile = pendingProfile;
    pendingProfile = null;
    return profile;
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    getPendingOAuthProfile: () => OAuthProfile | null;
  }
}

export default fp(passportPlugin, {
  name: 'passport',
  dependencies: ['session'],
});
