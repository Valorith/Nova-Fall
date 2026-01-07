import { redis } from '../../lib/redis.js';
import type { GameStatusResponse } from './types.js';

const NEXT_UPKEEP_KEY = 'game:nextUpkeepAt';
const ONE_HOUR_MS = 60 * 60 * 1000;

export async function getGameStatus(): Promise<GameStatusResponse> {
  const nextUpkeepAtStr = await redis.get(NEXT_UPKEEP_KEY);
  let nextUpkeepAt = parseInt(nextUpkeepAtStr ?? '0', 10);

  // If not set or in the past, calculate next upkeep time
  if (!nextUpkeepAt || nextUpkeepAt < Date.now()) {
    nextUpkeepAt = Date.now() + ONE_HOUR_MS;
    await redis.set(NEXT_UPKEEP_KEY, nextUpkeepAt.toString());
  }

  return {
    nextUpkeepAt,
    upkeepInterval: ONE_HOUR_MS,
  };
}
