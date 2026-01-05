declare module 'passport-discord' {
  import { Strategy as PassportStrategy } from 'passport';

  interface Profile {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    email?: string;
    verified?: boolean;
    provider: string;
    accessToken: string;
    fetchedAt: Date;
    guilds?: {
      id: string;
      name: string;
      icon: string | null;
      owner: boolean;
      permissions: number;
    }[];
  }

  interface StrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    scope?: string[];
  }

  type VerifyCallback = (err: Error | null, user?: unknown) => void;

  type VerifyFunction = (
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback
  ) => void | Promise<void>;

  export class Strategy extends PassportStrategy {
    constructor(options: StrategyOptions, verify: VerifyFunction);
    name: string;
  }
}
