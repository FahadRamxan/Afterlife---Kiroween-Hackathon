// pnpm pipeline:record [app ...]: runs the real pipeline on each Graveyard app (a throwaway
// Postgres in Docker, this worker, headless js-dos) and saves the run in recorded/<app>.json for
// demo mode. Run it again whenever a step changes what it does.
import { mkdirSync, writeFileSync } from 'node:fs';
import { SEED_PROJECTS, createBoss, createDb, migrateUp, projects } from '@afterlife/db';
import { startTestPostgres } from '@afterlife/db/testing/postgres';
import { runPipeline, waitForPipeline } from './pipeline';
import { RECORDED_DIR, recordRun } from './recording';
import { startWorker } from './worker';

const apps = process.argv.slice(2).length
  ? process.argv.slice(2)
  : SEED_PROJECTS.map((p) => p.sourceApp);

const pg = await startTestPostgres();
const db = createDb(pg.url);
const boss = createBoss(pg.url, { background: false });
let worker: Awaited<ReturnType<typeof startWorker>> | undefined;
try {
  await migrateUp(db.$client);
  worker = await startWorker({ databaseUrl: pg.url, pollingIntervalSeconds: 0.5, log: () => {} });
  await boss.start();
  mkdirSync(RECORDED_DIR, { recursive: true });
  for (const app of apps) {
    const seed = SEED_PROJECTS.find((p) => p.sourceApp === app);
    if (!seed) throw new Error(`${app} is not a Graveyard app`);
    const [p] = await db
      .insert(projects)
      .values({ name: seed.name, source: 'graveyard', sourceApp: app })
      .returning();
    await runPipeline(boss, db, p!.id);
    const state = await waitForPipeline(db, p!.id, 10 * 60_000);
    if (state.status !== 'done') throw new Error(`${app}: the pipeline ended ${state.status}`);
    const rec = await recordRun(db, p!.id);
    writeFileSync(`${RECORDED_DIR}${app}.json`, `${JSON.stringify(rec, null, 2)}\n`);
    console.log(`recorded ${app}: ${rec.steps.map((s) => `${s.step}=${s.status}`).join(' ')}`);
  }
} finally {
  await worker?.stop();
  await boss.stop({ graceful: false });
  await db.$client.end();
  pg.stop();
}
