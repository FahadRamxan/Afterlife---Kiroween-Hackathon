// For *.pg.test.ts files: each test file gets its own empty database on the test server that
// global-setup.ts started (Postgres 16 in Docker) or that TEST_DATABASE_URL points at.
import pg from 'pg';
import { inject } from 'vitest';
import { createDb, type Db } from '../client';
import { migrateUp } from '../migrate';
import { uuidv7 } from '../uuid';

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string;
  }
}

export type TestDatabase = { url: string; db: Db; drop(): Promise<void> };

/** Creates an empty database (migrated unless `migrate: false`). Call drop() in afterAll. */
export async function freshDatabase(opts: { migrate?: boolean } = {}): Promise<TestDatabase> {
  const admin = inject('pgAdminUrl');
  const name = `t_${uuidv7().replaceAll('-', '')}`;
  const c = new pg.Client({ connectionString: admin });
  await c.connect();
  await c.query(`CREATE DATABASE ${name}`);
  await c.end();
  const u = new URL(admin);
  u.pathname = `/${name}`;
  const url = u.toString();
  const db = createDb(url);
  if (opts.migrate !== false) await migrateUp(db.$client);
  return {
    url,
    db,
    async drop() {
      await db.$client.end();
      const d = new pg.Client({ connectionString: admin });
      await d.connect();
      await d.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await d.end();
    },
  };
}
