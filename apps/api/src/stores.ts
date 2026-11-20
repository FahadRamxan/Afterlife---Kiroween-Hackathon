// Picks the stores for this process: Postgres when DATABASE_URL is set (migrated to the latest
// schema and seeded first), otherwise memory, and says which.
import { createDb, migrateUp, seed } from '@afterlife/db';
import type { AppStores } from './app';
import type { Env } from './env';
import { PgLiveHub } from './live';
import { PgLlmCallStore } from './llm-calls';
import { PgRuleEvidenceStore } from './rules';
import { PgScreenGraphStore } from './screen-graph';
import { PgPipeline } from './pipeline';
import { PgSoulStore } from './souls';
import { PgUploadStore } from './uploads';
import { MemoryProjectStore } from './projects';
import { PgProjectStore } from './projects-pg';
import { MemorySessionStore } from './sessions';
import { PgSessionStore } from './sessions-pg';

type Log = { info(o: object, msg: string): void; warn(msg: string): void };

export async function openStores(
  env: Partial<Pick<Env, 'DATABASE_URL'>>,
  log: Log,
): Promise<{
  stores: AppStores & Required<Pick<AppStores, 'sessions' | 'projects'>>;
  close(): Promise<void>;
}> {
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
  const live = await PgLiveHub.start(db, env.DATABASE_URL, log);
  const pipeline = await PgPipeline.start(db, env.DATABASE_URL, log);
  return {
    stores: {
      sessions: new PgSessionStore(db),
      projects: new PgProjectStore(db),
      uploads: new PgUploadStore(db),
      souls: new PgSoulStore(db),
      llmCalls: new PgLlmCallStore(db),
      screenGraphs: new PgScreenGraphStore(db),
      ruleEvidence: new PgRuleEvidenceStore(db),
      live,
      pipeline,
    },
    close: async () => {
      await pipeline.close();
      await live.close();
      await db.$client.end();
    },
  };
}
