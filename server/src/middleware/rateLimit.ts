import { NextFunction, Request, Response } from 'express';
import { isRedisReady, redis } from '../config/redis';
import { ApiError } from '../utils/ApiError';

/*
 * Fixed-window rate limit: "at most `limit` requests per `windowSeconds`" for each caller.
 *
 * In Redis it is one counter per caller:
 *   INCR  rl:login:ip:1.2.3.4        -> adds 1 and returns the new count
 *   EXPIRE (only on the first hit)   -> the counter disappears after the window, resetting the limit
 *
 * INCR and EXPIRE are sent as one small script so Redis runs them as a single step.
 * Without that, a crash between the two commands could leave a counter that never expires.
 */
const SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return { current, redis.call('TTL', KEYS[1]) }
`;

interface Options {
  name: string; // each name has its own counters, so a busy route does not use up another route's allowance
  limit: number;
  windowSeconds: number;
}

export function rateLimit({ name, limit, windowSeconds }: Options) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!redis || !isRedisReady()) return next(); // no Redis: no limiting

    let retryAfter: number | null = null;
    try {
      const [count, ttl] = (await redis.eval(SCRIPT, 1, `rl:${name}:ip:${req.ip}`, windowSeconds)) as [number, number];
      res.set({
        'RateLimit-Limit': String(limit),
        'RateLimit-Remaining': String(Math.max(0, limit - count)),
        'RateLimit-Reset': String(ttl),
      });
      if (count > limit) retryAfter = ttl;
    } catch {
      return next(); // "fail open": if Redis breaks, let the request through rather than block everybody
    }

    if (retryAfter !== null) {
      res.set('Retry-After', String(retryAfter));
      return next(new ApiError(429, 'Too many requests. Please slow down and try again shortly.'));
    }
    next();
  };
}
