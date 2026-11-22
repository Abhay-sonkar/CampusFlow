import Redis from 'ioredis';
import { env } from './env';

/*
 * One shared connection to Redis, or null when REDIS_URL is not set.
 * Everything that uses Redis checks for null first, so Redis is an optimisation,
 * never a requirement: if it is missing or goes down, the app keeps working.
 *
 * enableOfflineQueue: false  -> if Redis is unreachable, commands fail at once
 *                               instead of waiting in a queue (a slow Redis must not slow the API).
 */
export const redis: Redis | null = env.REDIS_URL
  ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false })
  : null;

export const isRedisReady = () => redis !== null && redis.status === 'ready';

if (redis) {
  let lastWarning = 0;
  redis.on('ready', () => console.log('Redis connected'));
  redis.on('error', (err) => {
    // Log at most once every 10 seconds so a Redis outage does not flood the terminal
    if (Date.now() - lastWarning > 10_000) {
      console.warn('Redis problem (the app keeps working without it):', err.message);
      lastWarning = Date.now();
    }
  });
}
