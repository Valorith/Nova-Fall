import { Strategy as DiscordStrategy, type Profile } from 'passport-discord';
import { config } from '../../../config/index.js';
import type { OAuthProfile } from '../types.js';

export function createDiscordStrategy(
  onVerify: (profile: OAuthProfile) => Promise<void>
): DiscordStrategy | null {
  const { clientId, clientSecret, callbackUrl } = config.oauth.discord;

  if (!clientId || !clientSecret) {
    console.warn('Discord OAuth not configured - missing client credentials');
    return null;
  }

  return new DiscordStrategy(
    {
      clientID: clientId,
      clientSecret: clientSecret,
      callbackURL: callbackUrl,
      scope: ['identify', 'email'],
    },
    async (
      _accessToken: string,
      _refreshToken: string,
      profile: Profile,
      done: (err: Error | null, user?: OAuthProfile) => void
    ) => {
      try {
        const email = profile.email;
        if (!email) {
          return done(new Error('Email not provided by Discord'));
        }

        const oauthProfile: OAuthProfile = {
          provider: 'discord',
          id: profile.id,
          email,
          username: profile.username,
          avatarUrl: profile.avatar
            ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
            : null,
        };

        await onVerify(oauthProfile);
        done(null, oauthProfile);
      } catch (err) {
        done(err as Error);
      }
    }
  );
}
