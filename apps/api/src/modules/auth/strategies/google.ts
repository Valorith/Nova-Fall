import { Strategy as GoogleStrategy, type Profile } from 'passport-google-oauth20';
import { config } from '../../../config/index.js';
import type { OAuthProfile } from '../types.js';

export function createGoogleStrategy(
  onVerify: (profile: OAuthProfile) => Promise<void>
): GoogleStrategy | null {
  const { clientId, clientSecret, callbackUrl } = config.oauth.google;

  if (!clientId || !clientSecret) {
    console.warn('Google OAuth not configured - missing client credentials');
    return null;
  }

  return new GoogleStrategy(
    {
      clientID: clientId,
      clientSecret: clientSecret,
      callbackURL: callbackUrl,
      scope: ['profile', 'email'],
    },
    async (
      _accessToken: string,
      _refreshToken: string,
      profile: Profile,
      done: (err: Error | null, user?: OAuthProfile) => void
    ) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error('Email not provided by Google'));
        }

        const oauthProfile: OAuthProfile = {
          provider: 'google',
          id: profile.id,
          email,
          username: profile.displayName ?? email.split('@')[0] ?? 'user',
          avatarUrl: profile.photos?.[0]?.value ?? null,
        };

        await onVerify(oauthProfile);
        done(null, oauthProfile);
      } catch (err) {
        done(err as Error);
      }
    }
  );
}
