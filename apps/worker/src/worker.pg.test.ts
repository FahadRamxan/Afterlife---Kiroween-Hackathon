// The worker process on a clean database: it migrates, makes the queues, runs a job, and stops.
import {
  appliedMigrations,
  createBoss,
  enqueueStep,
  pipelineSteps,
  projects,
  readMigrations,
  eq,
} from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startWorker } from './worker';

vi.setConfig({ testTimeout: 60_000 });

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase({ migrate: false });
});
afterAll(() => t.drop());

describe('startWorker on Postgres', () => {
  it('migrates, runs a queued step, and stops cleanly (stop is idempotent)', async () => {
    const lines: string[] = [];
    const worker = await startWorker({
      databaseUrl: t.url,
      pollingIntervalSeconds: 0.5,
      log: (l) => lines.push(l),
    });
    expect(await appliedMigrations(t.db.$client)).toEqual(readMigrations().map((m) => m.id));
    expect(lines).toContain('afterlife worker started');

    const [p] = await t.db
      .insert(projects)
      .values({ name: 'Iqra School Fees', source: 'graveyard', sourceApp: 'iqra' })
      .returning();
    const boss = createBoss(t.url);
    await boss.start();
    try {
      await enqueueStep(boss, t.db, 'rebirth', { projectId: p!.id });
    } finally {
      await boss.stop({ graceful: false });
    }
    const end = Date.now() + 30_000;
    let status: string | undefined;
    while (Date.now() < end) {
      status = (
        await t.db.select().from(pipelineSteps).where(eq(pipelineSteps.projectId, p!.id))
      )[0]?.status;
      if (status === 'skipped') break;
      await new Promise((r) => setTimeout(r, 200));
    }
    // The Surgeon has no Soul to work on yet (Prompt 63): skipped, and says so, not done.
    expect(status).toBe('skipped');
    const [row] = await t.db.select().from(pipelineSteps).where(eq(pipelineSteps.projectId, p!.id));
    expect(row!.output).toEqual({ reason: 'This project has no Soul yet' });

    await Promise.all([worker.stop(), worker.stop()]);
    expect(lines.filter((l) => l === 'afterlife worker stopped')).toHaveLength(1);
  });
});
