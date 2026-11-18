// The worker process: migrates the database (the API does too; an advisory lock keeps them from
// clashing), starts pg-boss, makes the queues, and runs the job loop until it is stopped.
import {
  createBoss,
  createDb,
  ensureQueues,
  migrateUp,
  type JobOptions,
  type JobType,
} from '@afterlife/db';
import { startJobLoop } from './loop';
import { defaultRegistry, type Registry } from './registry';

export type WorkerOptions = {
  databaseUrl: string | undefined;
  registry?: Registry;
  options?: Partial<Record<JobType, Partial<JobOptions>>>;
  pollingIntervalSeconds?: number;
  log?: (line: string) => void;
};

export type RunningWorker = { stop: () => Promise<void> };

export async function startWorker({
  databaseUrl,
  registry = defaultRegistry(),
  options,
  pollingIntervalSeconds,
  log = console.log,
}: WorkerOptions): Promise<RunningWorker> {
  if (!databaseUrl)
    throw new Error('The worker needs DATABASE_URL: its jobs live in Postgres (pg-boss)');
  const db = createDb(databaseUrl, {
    max: 3,
    onIdleError: (e) => log(`database closed an idle connection: ${e.message}`),
  });
  const boss = createBoss(databaseUrl, { onError: (e) => log(`pg-boss error: ${e.message}`) });
  try {
    await migrateUp(db.$client);
    await boss.start();
    await ensureQueues(boss, options);
  } catch (e) {
    await boss.stop({ graceful: false }).catch(() => {});
    await db.$client.end();
    throw e;
  }
  const loop = await startJobLoop({ db, boss, registry, options, pollingIntervalSeconds, log });
  log('afterlife worker started');
  let stopping: Promise<void> | undefined;
  return {
    stop() {
      stopping ??= (async () => {
        // Let the running attempt finish (up to 30 s), then close.
        await loop.stop();
        await boss.stop({ graceful: true, timeout: 30_000 });
        await db.$client.end();
        log('afterlife worker stopped');
      })();
      return stopping;
    },
  };
}
