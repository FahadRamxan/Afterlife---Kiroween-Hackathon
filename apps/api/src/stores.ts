// Picks the stores for this process: Postgres when DATABASE_URL is set (migrated to the latest
// schema and seeded first), otherwise memory, and says which.
import { createDb, migrateUp, seed } from '@afterlife/db';
import type { AppStores } from './app';
import type { Env } from './env';
import { MemoryProjectStore } from './projects';
import { PgProjectStore } from './projects-pg';
import { MemorySessionStore } from './sessions';
import { PgSessionStore } from './sessions-pg';

type Log = { info(o: object, msg: string): void; warn(msg: string): void };

export async function openStores(
  env: Partial<Pick<Env, 'DATABASE_URL'>>,
  log: Log,
): Promise<{ stores: Required<AppStores>; close(): Promise<void> }> {
  if (!env.DATABASE_URL) {
    log.warn('No DATABASE_URL: projects and séances are kept in memory and lost on a restart');
    return {
      stores: { sessions: new MemorySessionStore(), projects: new MemoryProjectStore() },
      close: async () => {},
    };
  }
  const db = createDb(env.DATABASE_URL, {
    onIdleError: (e) => log.warn(`database closed an idle connection: ${e.message}`),
  });
  try {
    const applied = await migrateUp(db.$client);
    // The Graveyard demo projects (idempotent).
    await seed(db);
    // The host only: the URL carries the password.
    log.info({ db: new URL(env.DATABASE_URL).host, applied }, 'database ready');
  } catch (e) {
    await db.$client.end();
    throw e;
  }
  return {
    stores: { sessions: new PgSessionStore(db), projects: new PgProjectStore(db) },
    close: () => db.$client.end(),
  };
}
