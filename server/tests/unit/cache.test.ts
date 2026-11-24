// The real Redis is replaced by a tiny fake that keeps everything in a Map
jest.mock('../../src/config/redis', () => {
  const store = new Map<string, string>();
  const redis = {
    status: 'ready',
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    },
    incr: async (key: string) => {
      const next = Number(store.get(key) ?? 0) + 1;
      store.set(key, String(next));
      return next;
    },
  };
  return { redis, isRedisReady: () => true };
});

import { cached, invalidate } from '../../src/utils/cache';

const fakeRedis = jest.requireMock('../../src/config/redis').redis;

describe('cached (cache-aside)', () => {
  it('asks the database the first time (MISS) and Redis afterwards (HIT)', async () => {
    const load = jest.fn().mockResolvedValue({ items: [1, 2, 3] });

    const first = await cached('notices', { page: 1 }, 60, load);
    const second = await cached('notices', { page: 1 }, 60, load);

    expect(first).toEqual({ data: { items: [1, 2, 3] }, status: 'MISS' });
    expect(second).toEqual({ data: { items: [1, 2, 3] }, status: 'HIT' });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps different questions apart', async () => {
    const load = jest.fn().mockResolvedValueOnce('page one').mockResolvedValueOnce('page two');
    const one = await cached('things', { page: 1 }, 60, load);
    const two = await cached('things', { page: 2 }, 60, load);
    expect(one.data).toBe('page one');
    expect(two.data).toBe('page two');
    expect(two.status).toBe('MISS');
  });

  it('forgets everything in a namespace after invalidate()', async () => {
    const load = jest.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('new');
    await cached('feed', {}, 60, load);
    expect((await cached('feed', {}, 60, load)).status).toBe('HIT');

    await invalidate('feed');

    const afterChange = await cached('feed', {}, 60, load);
    expect(afterChange).toEqual({ data: 'new', status: 'MISS' });
  });

  it('only forgets the namespace that changed', async () => {
    const load = jest.fn().mockResolvedValue('value');
    await cached('alpha', {}, 60, load);
    await cached('beta', {}, 60, load);
    await invalidate('alpha');
    expect((await cached('beta', {}, 60, load)).status).toBe('HIT');
  });

  it('falls back to the database when Redis breaks, instead of failing', async () => {
    const original = fakeRedis.get;
    fakeRedis.get = async () => {
      throw new Error('Redis is down');
    };
    try {
      const load = jest.fn().mockResolvedValue('from the database');
      const result = await cached('anything', {}, 60, load);
      expect(result.data).toBe('from the database');
      expect(result.status).toBe('MISS');
    } finally {
      fakeRedis.get = original;
    }
  });
});
