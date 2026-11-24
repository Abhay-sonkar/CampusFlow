// A fake Redis that implements just the counter script the rate limiter uses
jest.mock('../../src/config/redis', () => {
  const counters = new Map<string, number>();
  const redis = {
    status: 'ready',
    eval: async (_script: string, _keys: number, key: string, windowSeconds: number) => {
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return [count, windowSeconds];
    },
  };
  return { redis, isRedisReady: () => true };
});

import { rateLimit } from '../../src/middleware/rateLimit';
import { ApiError } from '../../src/utils/ApiError';

const fakeRedis = jest.requireMock('../../src/config/redis').redis;

const call = async (middleware: ReturnType<typeof rateLimit>, ip: string) => {
  const res = { set: jest.fn() };
  const next = jest.fn();
  await middleware({ ip } as any, res as any, next);
  return { res, next };
};

describe('rateLimit', () => {
  it('lets requests through until the limit, then answers 429', async () => {
    const limiter = rateLimit({ name: 'test-a', limit: 2, windowSeconds: 60 });

    const first = await call(limiter, '1.1.1.1');
    const second = await call(limiter, '1.1.1.1');
    const third = await call(limiter, '1.1.1.1');

    expect(first.next).toHaveBeenCalledWith(); // no argument = carry on
    expect(second.next).toHaveBeenCalledWith();
    const error = third.next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(429);
  });

  it('tells the client how many requests are left and when to retry', async () => {
    const limiter = rateLimit({ name: 'test-b', limit: 1, windowSeconds: 30 });

    const allowed = await call(limiter, '2.2.2.2');
    expect(allowed.res.set).toHaveBeenCalledWith(expect.objectContaining({ 'RateLimit-Limit': '1', 'RateLimit-Remaining': '0' }));

    const blocked = await call(limiter, '2.2.2.2');
    expect(blocked.res.set).toHaveBeenCalledWith('Retry-After', '30');
  });

  it('counts every caller separately', async () => {
    const limiter = rateLimit({ name: 'test-c', limit: 1, windowSeconds: 60 });
    await call(limiter, '3.3.3.3');
    const otherCaller = await call(limiter, '4.4.4.4');
    expect(otherCaller.next).toHaveBeenCalledWith();
  });

  it('counts every rule separately', async () => {
    const strict = rateLimit({ name: 'test-d-strict', limit: 1, windowSeconds: 60 });
    const relaxed = rateLimit({ name: 'test-d-relaxed', limit: 100, windowSeconds: 60 });
    await call(strict, '5.5.5.5');
    expect((await call(strict, '5.5.5.5')).next.mock.calls[0][0]).toBeInstanceOf(ApiError);
    expect((await call(relaxed, '5.5.5.5')).next).toHaveBeenCalledWith();
  });

  it('lets everyone through when Redis breaks ("fail open") instead of blocking the whole site', async () => {
    const original = fakeRedis.eval;
    fakeRedis.eval = async () => {
      throw new Error('Redis is down');
    };
    try {
      const limiter = rateLimit({ name: 'test-e', limit: 1, windowSeconds: 60 });
      await call(limiter, '6.6.6.6');
      const second = await call(limiter, '6.6.6.6');
      expect(second.next).toHaveBeenCalledWith();
    } finally {
      fakeRedis.eval = original;
    }
  });
});
