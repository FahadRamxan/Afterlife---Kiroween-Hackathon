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

  it('reads a Postgres DATABASE_URL, and refuses anything else', () => {
    const url = 'postgres://u:p@ep-x.neon.tech/afterlife?sslmode=require';
    expect(parseEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
    expect(parseEnv({ DATABASE_URL: 'postgresql://localhost/a' }).DATABASE_URL).toBe(
      'postgresql://localhost/a',
    );
    expect(() => parseEnv({ DATABASE_URL: 'mysql://localhost/a' })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: 'nonsense' })).toThrow(/DATABASE_URL/);
    // An empty value (a blank line in .env) means "no database", not an error.
    expect(parseEnv({ DATABASE_URL: '' }).DATABASE_URL).toBeUndefined();
  });

  it('never puts the database password in its error message', () => {
    expect(() => parseEnv({ DATABASE_URL: 'mysql://u:hunter2@h/a' })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('hunter2') }),
    );
  });

  it('property: every valid port string parses to the same number', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 65535 }), (p) => {
        expect(parseEnv({ PORT: String(p) }).PORT).toBe(p);
      }),
    );
  });
});
