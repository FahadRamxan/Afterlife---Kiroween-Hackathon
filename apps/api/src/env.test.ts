import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('has safe local defaults', () => {
    expect(parseEnv({})).toEqual({
      PORT: 4000,
      HOST: '0.0.0.0',
      WEB_ORIGINS: ['http://localhost:3000'],
      LOG_LEVEL: 'info',
    });
  });

  it('reads a comma-separated list of allowed web origins', () => {
    expect(
      parseEnv({ WEB_ORIGINS: 'https://afterlife.vercel.app, http://localhost:3000' }).WEB_ORIGINS,
    ).toEqual(['https://afterlife.vercel.app', 'http://localhost:3000']);
  });

  it('rejects a bad port, a bad origin and an unknown log level', () => {
    expect(() => parseEnv({ PORT: 'eighty' })).toThrow(/PORT/);
    expect(() => parseEnv({ PORT: '70000' })).toThrow(/PORT/);
    expect(() => parseEnv({ WEB_ORIGINS: 'not a url' })).toThrow(/WEB_ORIGINS/);
    expect(() => parseEnv({ LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });

  it('property: every valid port string parses to the same number', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 65535 }), (p) => {
        expect(parseEnv({ PORT: String(p) }).PORT).toBe(p);
      }),
    );
  });
});
