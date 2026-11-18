// Migrations up and down. drizzle-kit writes each up migration from schema.ts; its .down.sql is
// written by hand next to it. Applied migrations are listed in `afterlife_migrations`. Each one
// runs in its own transaction, under an advisory lock, so the API and the worker can both start
// at once and only one of them migrates.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient } from 'pg';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
export const MIGRATIONS_TABLE = 'afterlife_migrations';
/** Any constant works; it only has to be the same for every process that migrates. */
const LOCK_KEY = 0x0af7e71f;
const BREAKPOINT = '--> statement-breakpoint';

export class MigrationError extends Error {
  override name = 'MigrationError';
}

export type Migration = { id: string; up: string[]; down: string[] };

/** drizzle-kit separates statements with `--> statement-breakpoint`. */
export function splitStatements(sql: string): string[] {
  return sql
    .split(BREAKPOINT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Pairs `0000_name.sql` with `0000_name.down.sql`, sorted by id. Other files are ignored. */
export function loadMigrations(files: Record<string, string>): Migration[] {
  const ups = new Map<string, string>();
  const downs = new Map<string, string>();
  for (const [name, sql] of Object.entries(files)) {
    if (!name.endsWith('.sql')) continue;
    const m = /^(\d{4}_[a-z0-9_]+?)(\.down)?\.sql$/.exec(name);
    if (!m) throw new MigrationError(`${name}: a migration is named like 0000_name.sql`);
    (m[2] ? downs : ups).set(m[1]!, sql);
  }
  for (const id of downs.keys())
    if (!ups.has(id)) throw new MigrationError(`${id}.down.sql has no ${id}.sql`);
  return [...ups.keys()].sort().map((id) => {
    const down = downs.get(id);
    if (down === undefined) throw new MigrationError(`${id} has no ${id}.down.sql`);
    return { id, up: splitStatements(ups.get(id)!), down: splitStatements(down) };
  });
}

/** The migrations in packages/db/migrations. */
export function readMigrations(dir = MIGRATIONS_DIR): Migration[] {
  return loadMigrations(
    Object.fromEntries(
      readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .map((f) => [f, readFileSync(resolve(dir, f), 'utf8')]),
    ),
  );
}

/** Applied must be the first migrations this code knows, in order. */
function checkApplied(known: string[], applied: string[]) {
  applied.forEach((id, i) => {
    if (known[i] !== id)
      throw new MigrationError(
        known.includes(id)
          ? `The database applied ${id} out of order (expected ${known[i]})`
          : `The database has migration ${id}, which this code does not know (is newer code deployed?)`,
      );
  });
}

/** The ids to apply, in order. */
export function planUp(known: string[], applied: string[]): string[] {
  checkApplied(known, applied);
  return known.slice(applied.length);
}

/** The ids to undo, newest first, at most `steps` of them. */
export function planDown(known: string[], applied: string[], steps: number): string[] {
  checkApplied(known, applied);
  return applied.slice().reverse().slice(0, steps);
}

async function withLock<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await c.query(
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
    );
    return await fn(c);
  } finally {
    await c.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    c.release();
  }
}

async function applied(c: PoolClient): Promise<string[]> {
  const r = await c.query<{ id: string }>(`SELECT id FROM ${MIGRATIONS_TABLE} ORDER BY id`);
  return r.rows.map((x) => x.id);
}

async function inTransaction(c: PoolClient, statements: string[], after: [string, string[]]) {
  await c.query('BEGIN');
  try {
    for (const s of statements) await c.query(s);
    await c.query(after[0], after[1]);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  }
}

/** Applies every pending migration. Returns the ids it applied. */
export async function migrateUp(pool: Pool, migrations = readMigrations()): Promise<string[]> {
  return withLock(pool, async (c) => {
    const todo = planUp(
      migrations.map((m) => m.id),
      await applied(c),
    );
    for (const id of todo) {
      const m = migrations.find((x) => x.id === id)!;
      await inTransaction(c, m.up, [`INSERT INTO ${MIGRATIONS_TABLE} (id) VALUES ($1)`, [id]]);
    }
    return todo;
  });
}

/** Undoes the newest `steps` applied migrations (all of them by default). Returns their ids. */
export async function migrateDown(
  pool: Pool,
  steps = Infinity,
  migrations = readMigrations(),
): Promise<string[]> {
  return withLock(pool, async (c) => {
    const todo = planDown(
      migrations.map((m) => m.id),
      await applied(c),
      steps,
    );
    for (const id of todo) {
      const m = migrations.find((x) => x.id === id)!;
      await inTransaction(c, m.down, [`DELETE FROM ${MIGRATIONS_TABLE} WHERE id = $1`, [id]]);
    }
    return todo;
  });
}

/** Ids of the applied migrations, oldest first. */
export async function appliedMigrations(pool: Pool): Promise<string[]> {
  return withLock(pool, applied);
}
