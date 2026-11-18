// Prompt 39: the orchestrator on pg-boss and Postgres, with fake steps: order, saved outputs,
// resume after a failure, a step re-run alone, and demo mode (a recorded run).
import {
  createBoss,
  ensureQueues,
  listEvents,
  PIPELINE,
  projects,
  type JobOptions,
  type JobType,
} from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startJobLoop, type JobLoop } from './loop';
import { pipelineState, rerunStep, runPipeline, waitForPipeline } from './pipeline';
import type { Recording } from './recording';
import { defaultRegistry, type Registry, type StepHandler } from './registry';

vi.setConfig({ testTimeout: 60_000 });

const NO_RETRY = Object.fromEntries(
  PIPELINE.map((s) => [s, { retryLimit: 0, retryDelay: 0, retryBackoff: false }]),
) as Partial<Record<JobType, Partial<JobOptions>>>;

let t: TestDatabase;
let boss: PgBoss;
let loop: JobLoop;
const ran: string[] = [];
let failArchaeology = false;
const fake =
  (step: string): StepHandler =>
  async (ctx) => {
    ran.push(`${ctx.projectId.slice(-4)}:${step}`);
    if (step === 'archaeology' && failArchaeology) throw new Error('the model did not answer');
    await ctx.log(`${step} ran`);
    return { status: 'done', output: { step, attempt: ctx.attempt } };
  };
const registry: Registry = {
  ...defaultRegistry(),
  ...Object.fromEntries(PIPELINE.map((s) => [s, fake(s)])),
};
const recording: Recording = {
  app: 'shifa',
  recordedAt: '2026-11-19T10:00:00.000Z',
  source: 'pnpm pipeline:record',
  steps: PIPELINE.map((step) => ({
    step,
    status: step === 'possess' ? ('done' as const) : ('skipped' as const),
    output: step === 'possess' ? { screens: 1 } : { reason: `The ${step} step is not built yet` },
    events:
      step === 'possess'
        ? [
            { type: 'log' as const, payload: { level: 'info', message: 'Booting' }, afterMs: 0 },
            {
              type: 'screen' as const,
              payload: { fingerprint: 'fp_0000000000000001' },
              afterMs: 50,
            },
          ]
        : [],
  })),
};

beforeAll(async () => {
  t = await freshDatabase();
  boss = createBoss(t.url);
  await boss.start();
  await ensureQueues(boss, NO_RETRY);
  loop = await startJobLoop({
    db: t.db,
    boss,
    registry,
    options: NO_RETRY,
    pollingIntervalSeconds: 0.5,
    recordingFor: (app) => (app === 'shifa' ? recording : null),
  });
});
afterAll(async () => {
  await loop?.stop();
  await boss?.stop({ graceful: false });
  await t.drop();
});

async function project(mode: 'live' | 'recorded' = 'live', sourceApp = 'shifa') {
  const [p] = await t.db
    .insert(projects)
    .values({ name: 'Shifa Medical Store', source: 'graveyard', sourceApp, mode })
    .returning();
  return p!.id;
}
const mine = (id: string) =>
  ran.filter((r) => r.startsWith(id.slice(-4))).map((r) => r.split(':')[1]);

describe('runPipeline', () => {
  it('runs the six steps in order, saves each output, and the project is done', async () => {
    const id = await project();
    await runPipeline(boss, t.db, id);
    const s = await waitForPipeline(t.db, id, 30_000);
    expect(s.status).toBe('done');
    expect(mine(id)).toEqual([...PIPELINE]);
    expect(s.steps.map((x) => [x.step, x.status, x.output])).toEqual(
      PIPELINE.map((step) => [step, 'done', { step, attempt: 1 }]),
    );
  });

  it('stops at a failed step; running it again resumes there without redoing what is done', async () => {
    const id = await project();
    failArchaeology = true;
    await runPipeline(boss, t.db, id);
    const failed = await waitForPipeline(t.db, id, 30_000);
    expect(failed.status).toBe('failed');
    expect(failed.steps.map((x) => x.status)).toEqual([
      'done',
      'failed',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);

    failArchaeology = false;
    await runPipeline(boss, t.db, id);
    const s = await waitForPipeline(t.db, id, 30_000);
    expect(s.status).toBe('done');
    // possess ran once; archaeology twice (the failure, then the resume).
    expect(mine(id)).toEqual([
      'possess',
      'archaeology',
      'archaeology',
      'rebirth',
      'undertake',
      'prove',
      'exorcise',
    ]);
    const log = (await listEvents(t.db, id, { limit: 500 })).map(
      (e) => e.payload as { message?: string },
    );
    expect(log.some((p) => p.message === 'possess is already done; not run again')).toBe(true);
  });

  it('a step re-run alone runs only that step', async () => {
    const id = await project();
    await runPipeline(boss, t.db, id);
    await waitForPipeline(t.db, id, 30_000);
    await rerunStep(boss, t.db, id, 'rebirth');
    const end = Date.now() + 20_000;
    while ((await pipelineState(t.db, id)).steps[2]!.attempts < 2 && Date.now() < end)
      await new Promise((r) => setTimeout(r, 200));
    await new Promise((r) => setTimeout(r, 1500));
    expect(mine(id)).toEqual([...PIPELINE, 'rebirth']);
    expect((await pipelineState(t.db, id)).steps[2]).toMatchObject({ status: 'done', attempts: 2 });
  });
});

describe('demo mode (a recorded run)', () => {
  it('replays the recording instead of running the steps, and every step says it is recorded', async () => {
    const id = await project('recorded');
    await runPipeline(boss, t.db, id);
    const s = await waitForPipeline(t.db, id, 30_000);
    expect(s.status).toBe('done');
    expect(mine(id)).toEqual([]); // no real step ran
    expect(s.steps[0]).toMatchObject({
      status: 'done',
      output: { screens: 1, recorded: { recordedAt: '2026-11-19T10:00:00.000Z' } },
    });
    expect(s.steps[1]!.output).toEqual({
      reason: 'Recorded run: The archaeology step is not built yet',
    });
    const events = await listEvents(t.db, id, { limit: 500 });
    expect(events.filter((e) => e.type === 'screen')).toHaveLength(1);
    expect(events.find((e) => e.type === 'log')!.payload).toMatchObject({
      message: 'Recorded run from 2026-11-19: replaying possess',
    });
  });

  it('an app with no recording is skipped and says so, never faked', async () => {
    const id = await project('recorded', 'iqra');
    await runPipeline(boss, t.db, id);
    const s = await waitForPipeline(t.db, id, 30_000);
    expect(s.steps.every((x) => x.status === 'skipped')).toBe(true);
    expect(s.steps[0]!.output).toEqual({ reason: 'There is no recorded run of iqra' });
  });
});
