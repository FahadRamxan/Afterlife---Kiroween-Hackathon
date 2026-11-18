// Prompt 35 "done when": the migrations run up and down on a clean Postgres 16.
import { eq, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { freshDatabase, type TestDatabase } from './testing';
import {
  appliedMigrations,
  migrateDown,
  migrateUp,
  readMigrations,
  MIGRATIONS_TABLE,
} from './migrate';
import { TABLES, observations, projects, sessions, souls } from './schema';
import { SEED_PROJECTS, seed } from './seed';

const NAMES = Object.keys(TABLES).sort();

async function tables(t: TestDatabase): Promise<string[]> {
  const r = await t.db.$client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`,
  );
  return r.rows.map((x) => x.table_name);
}

async function enums(t: TestDatabase): Promise<string[]> {
  const r = await t.db.$client.query<{ typname: string }>(
    `SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typtype = 'e' ORDER BY 1`,
  );
  return r.rows.map((x) => x.typname);
}

async function functions(t: TestDatabase): Promise<string[]> {
  const r = await t.db.$client.query<{ proname: string }>(
    `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' ORDER BY 1`,
  );
  return r.rows.map((x) => x.proname);
}

describe('migrations on a clean database', () => {
  let t: TestDatabase;
  beforeAll(async () => {
    t = await freshDatabase({ migrate: false });
  });
  afterAll(() => t.drop());

  it('up creates every table, down removes every table and type, and up works again', async () => {
    expect(await tables(t)).toEqual([]);
    const ids = readMigrations().map((m) => m.id);
    expect(await migrateUp(t.db.$client)).toEqual(ids);
    expect(await tables(t)).toEqual([MIGRATIONS_TABLE, ...NAMES].sort());
    expect(await enums(t)).not.toEqual([]);
    // Running up again does nothing.
    expect(await migrateUp(t.db.$client)).toEqual([]);

    expect(await migrateDown(t.db.$client)).toEqual(ids.slice().reverse());
    expect(await tables(t)).toEqual([MIGRATIONS_TABLE]);
    expect(await enums(t)).toEqual([]);
    expect(await functions(t)).toEqual([]);
    expect(await appliedMigrations(t.db.$client)).toEqual([]);

    expect(await migrateUp(t.db.$client)).toEqual(ids);
    expect(await tables(t)).toEqual([MIGRATIONS_TABLE, ...NAMES].sort());
  });

  it('two processes migrating at once apply each migration once (advisory lock)', async () => {
    await migrateDown(t.db.$client);
    // A second pool on the same database stands in for the second process.
    const second = createDb(t.url);
    try {
      const [a, b] = await Promise.all([migrateUp(t.db.$client), migrateUp(second.$client)]);
      expect([...a, ...b].sort()).toEqual(readMigrations().map((m) => m.id));
      expect(await appliedMigrations(t.db.$client)).toEqual(readMigrations().map((m) => m.id));
    } finally {
      await second.$client.end();
    }
  });
});

describe('createDb', () => {
  it('survives the server closing its idle connections (Neon suspends idle databases)', async () => {
    const t = await freshDatabase();
    const errors: Error[] = [];
    const db = createDb(t.url, { onIdleError: (e) => errors.push(e) });
    try {
      await db.$client.query('SELECT 1');
      // Another connection kills every other connection to this database, as a restart would.
      await t.db.$client.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
         WHERE datname = current_database() AND pid <> pg_backend_pid() AND application_name = ''`,
      );
      await new Promise((r) => setTimeout(r, 200));
      expect(errors.length).toBeGreaterThan(0);
      // The process is still alive, and the next query opens a fresh connection.
      expect((await db.$client.query('SELECT 1 AS one')).rows).toEqual([{ one: 1 }]);
    } finally {
      await db.$client.end();
      await t.drop();
    }
  });
});

describe('the migrated database matches schema.ts', () => {
  let t: TestDatabase;
  beforeAll(async () => {
    t = await freshDatabase();
  });
  afterAll(() => t.drop());

  it('every column in schema.ts exists with the same type and nullability, and no others', async () => {
    const r = await t.db.$client.query<{
      table_name: string;
      column_name: string;
      is_nullable: 'YES' | 'NO';
      udt_name: string;
    }>(
      `SELECT table_name, column_name, is_nullable, udt_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name <> $1 ORDER BY table_name, column_name`,
      [MIGRATIONS_TABLE],
    );
    const inDb = r.rows.map(
      (c) => `${c.table_name}.${c.column_name} ${c.udt_name} ${c.is_nullable}`,
    );
    const inCode = Object.values(TABLES)
      .flatMap((table) => {
        const cfg = getTableConfig(table);
        return cfg.columns.map((c) => {
          const type = c.getSQLType();
          const udt = c.columnType === 'PgEnumColumn' ? type : udtOf(type);
          return `${getTableName(table)}.${c.name} ${udt} ${c.notNull ? 'NO' : 'YES'}`;
        });
      })
      .sort();
    expect(inDb.sort()).toEqual(inCode);
  });

  it('ids are UUIDv7 made by the app', async () => {
    const [p] = await t.db
      .insert(projects)
      .values({ name: 'Test', source: 'upload', sourceApp: 'TEST.ZIP' })
      .returning();
    expect(p!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(p!.status).toBe('created');
  });

  it('deleting a project deletes its sessions, observations and souls', async () => {
    const [p] = await t.db
      .insert(projects)
      .values({ name: 'Doomed', source: 'graveyard', sourceApp: 'shifa' })
      .returning();
    const [s] = await t.db
      .insert(sessions)
      .values({ projectId: p!.id, app: 'shifa', startedAt: new Date('2026-11-18T10:00:00.000Z') })
      .returning();
    const screen = { fingerprint: 'fp_0000000000000000' };
    await t.db.insert(observations).values({
      sessionId: s!.id,
      projectId: p!.id,
      seq: 0,
      keys: '1',
      screenBeforeFp: 'fp_0000000000000000',
      screenAfterFp: 'fp_0000000000000001',
      screenBefore: screen,
      screenAfter: screen,
      dbfDiff: { tables: {} },
      durationMs: 5,
      stable: true,
    });
    await t.db
      .insert(souls)
      .values({ projectId: p!.id, version: 1, ir: {}, specMarkdown: '# Shifa' });
    await t.db.delete(projects).where(eq(projects.id, p!.id));
    expect(await t.db.select().from(sessions).where(eq(sessions.projectId, p!.id))).toEqual([]);
    expect(await t.db.select().from(observations).where(eq(observations.sessionId, s!.id))).toEqual(
      [],
    );
    expect(await t.db.select().from(souls).where(eq(souls.projectId, p!.id))).toEqual([]);
  });

  it('the checks refuse bad rows: a blank name, a soul version 0, audio without its type', async () => {
    await expect(
      t.db.insert(projects).values({ name: '  ', source: 'upload', sourceApp: 'X' }),
    ).rejects.toThrow();
    const [p] = await t.db
      .insert(projects)
      .values({ name: 'Checks', source: 'upload', sourceApp: 'X' })
      .returning();
    await expect(
      t.db.insert(souls).values({ projectId: p!.id, version: 0, ir: {}, specMarkdown: '' }),
    ).rejects.toThrow();
    await expect(
      t.db.insert(sessions).values({
        app: 'shifa',
        startedAt: new Date('2026-11-18T10:00:00.000Z'),
        audio: new Uint8Array([1]),
      }),
    ).rejects.toThrow();
  });

  it('seed adds the three Graveyard projects once, however often it runs', async () => {
    expect(await seed(t.db)).toBe(3);
    expect(await seed(t.db)).toBe(0);
    const rows = await t.db.select().from(projects).where(eq(projects.source, 'graveyard'));
    for (const s of SEED_PROJECTS)
      expect(rows.find((r) => r.id === s.id)).toMatchObject({
        name: s.name,
        sourceApp: s.sourceApp,
      });
  });
});

/** information_schema's udt_name for a Drizzle SQL type. */
function udtOf(type: string): string {
  const map: Record<string, string> = {
    uuid: 'uuid',
    text: 'text',
    integer: 'int4',
    bigint: 'int8',
    boolean: 'bool',
    jsonb: 'jsonb',
    bytea: 'bytea',
    'timestamp with time zone': 'timestamptz',
  };
  const u = map[type];
  if (!u) throw new Error(`Add ${type} to udtOf`);
  return u;
}
