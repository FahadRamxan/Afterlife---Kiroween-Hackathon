import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Pool, PoolClosedError, parsePoolEnv } from './pool';

function counting() {
  let made = 0;
  let live = 0;
  let maxLive = 0;
  const destroyed: number[] = [];
  return {
    create: async () => {
      made++;
      live++;
      maxLive = Math.max(maxLive, live);
      return made;
    },
    destroy: async (n: number) => {
      live--;
      destroyed.push(n);
    },
    stats: () => ({ made, live, maxLive, destroyed }),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Pool', () => {
  it('never has more than `size` at once, and waiters get one in turn', async () => {
    const f = counting();
    const pool = new Pool({ size: 2, ...f });
    const a = await pool.acquire();
    const b = await pool.acquire();
    const order: string[] = [];
    const c = pool.acquire().then((x) => (order.push('c'), x));
    const d = pool.acquire().then((x) => (order.push('d'), x));
    await tick();
    expect(order).toEqual([]);
    expect(pool.waiting).toBe(2);
    await pool.release(a);
    await c;
    await pool.release(b);
    await d;
    expect(order).toEqual(['c', 'd']);
    expect(f.stats().maxLive).toBe(2);
  });

  it('a released item is destroyed, and the next acquire makes a fresh one', async () => {
    // Every run must start clean (Prompt 30), so items are never reused.
    const f = counting();
    const pool = new Pool({ size: 1, ...f });
    const a = await pool.acquire();
    await pool.release(a);
    const b = await pool.acquire();
    expect(b).not.toBe(a);
    expect(f.stats().destroyed).toEqual([a]);
  });

  it('use() releases even when the work throws', async () => {
    const f = counting();
    const pool = new Pool({ size: 1, ...f });
    await expect(
      pool.use(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await pool.use(async (n) => n)).toBe(2);
    expect(f.stats().live).toBe(0);
  });

  it('a failed create frees its slot', async () => {
    let fail = true;
    const pool = new Pool({
      size: 1,
      create: async () => {
        if (fail) throw new Error('no browser');
        return 1;
      },
      destroy: async () => {},
    });
    await expect(pool.acquire()).rejects.toThrow('no browser');
    fail = false;
    expect(await pool.acquire()).toBe(1);
  });

  it('close destroys what is out, refuses waiters and new work', async () => {
    const f = counting();
    const pool = new Pool({ size: 1, ...f });
    await pool.acquire();
    const waiter = pool.acquire();
    await pool.close();
    await expect(waiter).rejects.toThrow(PoolClosedError);
    await expect(pool.acquire()).rejects.toThrow(PoolClosedError);
    expect(f.stats().live).toBe(0);
  });

  it('property: any mix of work never goes over the size, and everything is cleaned up', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 4 }),
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 20 }),
        async (size, waits) => {
          const f = counting();
          const pool = new Pool({ size, ...f });
          await Promise.all(
            waits.map((w) =>
              pool.use(async () => {
                // Microtask ticks still interleave the work, without a 1 ms timer each.
                for (let i = 0; i < w; i++) await Promise.resolve();
              }),
            ),
          );
          expect(f.stats().maxLive).toBeLessThanOrEqual(size);
          expect(f.stats().made).toBe(waits.length);
          expect(f.stats().live).toBe(0);
        },
      ),
      { numRuns: Math.min(Number(process.env.FC_NUM_RUNS ?? 100), 300) },
    );
  });
});

describe('parsePoolEnv', () => {
  it('has defaults', () => {
    expect(parsePoolEnv({})).toEqual({ size: 2, cycles: 20000 });
  });

  it('reads JSDOS_POOL_SIZE and JSDOS_CYCLES', () => {
    expect(parsePoolEnv({ JSDOS_POOL_SIZE: '6', JSDOS_CYCLES: '60000' })).toEqual({
      size: 6,
      cycles: 60000,
    });
  });

  it.each([
    { JSDOS_POOL_SIZE: '0' },
    { JSDOS_POOL_SIZE: '99' },
    { JSDOS_CYCLES: 'fast' },
    { JSDOS_CYCLES: '50' },
  ])('refuses %j, naming the variable', (env) => {
    expect(() => parsePoolEnv(env)).toThrow(/JSDOS_/);
  });
});
