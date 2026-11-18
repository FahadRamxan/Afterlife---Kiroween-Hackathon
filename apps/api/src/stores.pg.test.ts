import { appliedMigrations, readMigrations } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { parseEnv } from './env';
import { MemorySessionStore } from './sessions';
import { PgSessionStore } from './sessions-pg';
import { openStores } from './stores';

function logger() {
  const lines: string[] = [];
  return {
    lines,
    info: (o: object, msg: string) => lines.push(`${msg} ${JSON.stringify(o)}`),
    warn: (msg: string) => lines.push(msg),
  };
}

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase({ migrate: false });
});
afterAll(() => t.drop());

describe('openStores', () => {
  it('without DATABASE_URL keeps séances in memory, and warns that they do not survive', async () => {
    const log = logger();
    const { stores } = await openStores({}, log);
    expect(stores.sessions).toBeInstanceOf(MemorySessionStore);
    expect(log.lines.join('\n')).toMatch(/memory and lost on a restart/);
  });

  it('with DATABASE_URL migrates the database and uses Postgres, logging no password', async () => {
    const log = logger();
    const { stores, close } = await openStores({ DATABASE_URL: t.url }, log);
    try {
      expect(stores.sessions).toBeInstanceOf(PgSessionStore);
      expect(await appliedMigrations(t.db.$client)).toEqual(readMigrations().map((m) => m.id));
      expect(log.lines.join('\n')).toMatch(/database ready/);
      expect(log.lines.join('\n')).not.toContain(new URL(t.url).password);
    } finally {
      await close();
    }
  });

  it('/health then says the data is kept in Postgres', async () => {
    const { stores, close } = await openStores({ DATABASE_URL: t.url }, logger());
    const app = buildApp(parseEnv({}), { logger: false }, stores);
    try {
      expect((await app.inject({ method: 'GET', url: '/health' })).json().storage).toBe('postgres');
    } finally {
      await app.close();
      await close();
    }
  });

  it('fails to start, rather than run on memory, when the database cannot be reached', async () => {
    const bad = new URL(t.url);
    bad.port = '1';
    await expect(openStores({ DATABASE_URL: bad.toString() }, logger())).rejects.toThrow();
  });
});
