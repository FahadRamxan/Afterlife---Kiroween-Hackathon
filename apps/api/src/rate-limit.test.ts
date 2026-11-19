// The per-address rate limits are what keep one anonymous visitor from filling the database.
// Found in the Prompts 31 to 40 review: TRUST_PROXY=1 made Fastify trust every hop of
// X-Forwarded-For, so a visitor could write any address there and get a fresh allowance on every
// request. Now only proxies on a private network (Render's) are trusted.
import { describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { PRIVATE_PROXIES, parseEnv } from './env';

const SOME_PROJECT = '/api/projects/0190f1a2-0000-7000-8000-000000000000';
const LIMITS = { rateLimit: { perMinute: 2, createPerMinute: 2 } };

/** GETs a project (404 in a fresh memory store) from `from`, with these X-Forwarded-For values. */
async function statuses(trustProxy: string, from: string, forwardedFor: string[]) {
  const app = buildApp(parseEnv({ TRUST_PROXY: trustProxy }), { logger: false }, {}, LIMITS);
  try {
    const codes: number[] = [];
    for (const xff of forwardedFor) {
      const res = await app.inject({
        method: 'GET',
        url: SOME_PROJECT,
        remoteAddress: from,
        headers: { 'x-forwarded-for': xff },
      });
      codes.push(res.statusCode);
    }
    return codes;
  } finally {
    await app.close();
  }
}

describe('per-address rate limits behind a proxy (TRUST_PROXY=1)', () => {
  // Render's proxy connects from its private network and appends the address it saw.
  const PROXY = '10.0.0.1';

  it('a made-up address at the front of X-Forwarded-For does not reset the allowance', async () => {
    const codes = await statuses('1', PROXY, [
      '198.51.100.1, 203.0.113.7',
      '198.51.100.2, 203.0.113.7',
      '198.51.100.3, 203.0.113.7',
    ]);
    expect(codes).toEqual([404, 404, 429]);
  });

  it('two visitors behind the same proxy keep their own allowances', async () => {
    const codes = await statuses('1', PROXY, [
      '203.0.113.7',
      '203.0.113.7',
      '203.0.113.8',
      '203.0.113.8',
    ]);
    expect(codes).toEqual([404, 404, 404, 404]);
  });

  it('a visitor who connects directly cannot pick an address at all', async () => {
    const codes = await statuses('1', '198.51.100.9', [
      '203.0.113.1',
      '203.0.113.2',
      '203.0.113.3',
    ]);
    expect(codes).toEqual([404, 404, 429]);
  });
});

describe('TRUST_PROXY', () => {
  it('"1" trusts only private-network proxies; "0" none; or a list of addresses', () => {
    expect(parseEnv({}).TRUST_PROXY).toBe(false);
    expect(parseEnv({ TRUST_PROXY: '0' }).TRUST_PROXY).toBe(false);
    expect(parseEnv({ TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
    expect(parseEnv({ TRUST_PROXY: '1' }).TRUST_PROXY).toBe(PRIVATE_PROXIES);
    expect(parseEnv({ TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(PRIVATE_PROXIES);
    expect(parseEnv({ TRUST_PROXY: '10.0.0.0/8' }).TRUST_PROXY).toBe('10.0.0.0/8');
    expect(() => parseEnv({ TRUST_PROXY: 'every$thing' })).toThrow(/TRUST_PROXY/);
  });
});

describe('séances (POST /api/sessions)', () => {
  it('have the lower per-address limit that raises have (each may be 8 MB)', async () => {
    const app = buildApp(
      parseEnv({}),
      { logger: false },
      {},
      { rateLimit: { perMinute: 100, createPerMinute: 2 } },
    );
    try {
      const codes: number[] = [];
      for (let i = 0; i < 3; i++)
        codes.push(
          (await app.inject({ method: 'POST', url: '/api/sessions', payload: {} })).statusCode,
        );
      expect(codes).toEqual([400, 400, 429]);
    } finally {
      await app.close();
    }
  });
});
