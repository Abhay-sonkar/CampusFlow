import crypto from 'crypto';
import { isRedisReady, redis } from '../config/redis';

export type CacheStatus = 'HIT' | 'MISS' | 'BYPASS';

// Short, fixed-length key from any JSON-able value (so long queries do not make long keys)
const hashOf = (value: unknown) => crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 16);

/*
 * CACHE-ASIDE:
 *   1. look in Redis             -> found? return it            (HIT, about 1 ms)
 *   2. not found: ask MongoDB    -> save the answer in Redis for `ttlSeconds` (MISS)
 *   3. Redis unavailable         -> just ask MongoDB            (BYPASS)
 *
 * The key contains a "version number" for the namespace (for example the version of all notices).
 * To throw away every cached notice page at once we simply add 1 to that number (see invalidate):
 * the old keys are never asked for again and expire on their own.
 * This avoids scanning for keys to delete, which is slow and dangerous on a real Redis.
 */
export async function cached<T>(
  namespace: string,
  keyParts: unknown,
  ttlSeconds: number,
  load: () => Promise<T>
): Promise<{ data: T; status: CacheStatus }> {
  if (!redis || !isRedisReady()) return { data: await load(), status: 'BYPASS' };

  let key: string | null = null;
  try {
    const version = (await redis.get(`ver:${namespace}`)) ?? '0';
    key = `cache:${namespace}:v${version}:${hashOf(keyParts)}`;
    const hit = await redis.get(key);
    if (hit) return { data: JSON.parse(hit) as T, status: 'HIT' };
  } catch {
    // Redis hiccup: carry on and use the database
  }

  const data = await load();
  if (key) {
    try {
      // EX = expire after N seconds. Even if we forget to invalidate, stale data dies by itself.
      await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
    } catch {
      // Not being able to cache is not an error
    }
  }
  return { data, status: 'MISS' };
}

// Call after anything that changes the data: every cached page of that namespace becomes stale at once
export async function invalidate(namespace: string): Promise<void> {
  if (!redis || !isRedisReady()) return;
  try {
    await redis.incr(`ver:${namespace}`);
  } catch {
    // Worst case the cache is stale until its TTL runs out
  }
}
