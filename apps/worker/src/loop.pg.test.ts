// Prompt 37 "done when": a test enqueues a fake job, the worker completes it, and the status is
// updated. pg-boss on a real Postgres 16, the worker's real loop, fake handlers.
import {
  createBoss,
  enqueueStep,
  ensureQueues,
  listEvents,
  pipelineSteps,
  projects,
  type JobOptions,
  type JobType,
  and,
  eq,
} from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startJobLoop, type JobLoop } from './loop';
import { defaultRegistry, type Registry } from './registry';

vi.setConfig({ testTimeout: 60_000 });

// Fast retries and a short timeout for the tests (production values are in JOB_OPTIONS).
const FAST: Partial<Record<JobType, Partial<JobOptions>>> = {
  possess: { retryLimit: 1, retryDelay: 0, retryBackoff: false, timeoutSeconds: 2 },
  archaeology: { retryLimit: 0, retryDelay: 0, retryBackoff: false, timeoutSeconds: 1 },
};

let t: TestDatabase;
let boss: PgBoss;
let loop: JobLoop;
// Each test swaps in its own handlers through this registry.
const handlers: Partial<Registry> = {};
const registry = new Proxy(defaultRegistry(), {
  get: (target, key: string) => handlers[key as JobType] ?? target[key as JobType],
});

beforeAll(async () => {
  t = await freshDatabase();
  boss = createBoss(t.url);
  await boss.start();
  await ensureQueues(boss, FAST);
  loop = await startJobLoop({
    db: t.db,
    boss,
    registry,
    options: FAST,
    pollingIntervalSeconds: 0.5,
  });
});
afterAll(async () => {
  await loop?.stop();
  await boss?.stop({ graceful: false });
  await t.drop();
});

async function project(): Promise<string> {
  const [p] = await t.db
    .insert(projects)
    .values({ name: 'Shifa Medical Store', source: 'graveyard', sourceApp: 'shifa' })
    .returning();
  return p!.id;
}

async function step(projectId: string, type: JobType) {
  const [s] = await t.db
    .select()
    .from(pipelineSteps)
    .where(and(eq(pipelineSteps.projectId, projectId), eq(pipelineSteps.step, type)));
  return s;
}

async function until<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 30_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (ok(v)) return v;
    if (Date.now() > end) throw new Error(`timed out waiting; last value ${JSON.stringify(v)}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

describe('the worker job loop on pg-boss', () => {
  it('runs a queued job to completion: step done with its output, events written, job completed', async () => {
    const id = await project();
    handlers.possess = async (ctx) => {
      await ctx.log('possessing the old app');
      await ctx.emit('screen', { fingerprint: 'fp_0000000000000001' });
      return { status: 'done', output: { screens: 1 } };
    };
    const jobId = await enqueueStep(boss, t.db, 'possess', { projectId: id });
    expect(jobId).toBeTruthy();
    expect((await step(id, 'possess'))!.status).toBe('queued');

    const s = await until(
      () => step(id, 'possess'),
      (s) => s?.status === 'done',
    );
    expect(s).toMatchObject({ attempts: 1, output: { screens: 1 }, error: null, jobId });
    expect(s!.finishedAt).toBeInstanceOf(Date);

    const events = await listEvents(t.db, id);
    expect(events.map((e) => e.type)).toEqual(['step', 'log', 'screen', 'step']);
    expect(events[0]!.payload).toMatchObject({ step: 'possess', state: 'started', attempt: 1 });
    expect(events[3]!.payload).toMatchObject({ step: 'possess', state: 'done' });
    const job = await until(
      () => boss.getJobById('possess', jobId!),
      (j) => j?.state === 'completed',
    );
    expect(job!.state).toBe('completed');
  });

  // @spec exorcist#3.2 A recorded project whose Soul the owner changed proves it live.
  it('a recorded run replays its steps, until the owner changes the Soul: then they run live', async () => {
    const { SoulSchema, numberSoul, specRequirements } = await import('@afterlife/soul');
    const { insertSoulVersion } = await import('@afterlife/db');
    const { loadRecording } = await import('./recording');
    const rec = loadRecording('shifa')!;
    const [p] = await t.db
      .insert(projects)
      .values({
        name: 'Shifa Medical Store',
        source: 'graveyard',
        sourceApp: 'shifa',
        mode: 'recorded',
      })
      .returning();
    const soul = SoulSchema.parse(rec.soul);
    const changed = {
      ...soul,
      rules: [
        ...soul.rules,
        {
          ...soul.rules[0]!,
          id: 'exorcist-fix-x',
          kind: 'validate' as const,
          target: undefined,
          expression: 'medicine.expiry >= today',
        },
      ],
    };
    await insertSoulVersion(t.db, p!.id, (v, parent) => {
      const s = numberSoul(changed, p!.id, v, parent);
      return { ir: s, specMarkdown: specRequirements(s) };
    });
    let live = 0;
    handlers.prove = async () => (live++, { status: 'done', output: { live: true } });
    try {
      await enqueueStep(boss, t.db, 'prove', { projectId: p!.id, force: true });
      const s = await until(
        () => step(p!.id, 'prove'),
        (x) => x?.status === 'done',
      );
      expect(live).toBe(1);
      expect(s!.output).toEqual({ live: true });
    } finally {
      delete handlers.prove;
    }
  });

  // @spec ghost-twin#2.1 Ghost Twin is never in a recording: on a recorded project it runs live.
  it('a job the recording has no step for runs live on a recorded project', async () => {
    const [p] = await t.db
      .insert(projects)
      .values({
        name: 'Shifa Medical Store',
        source: 'graveyard',
        sourceApp: 'shifa',
        mode: 'recorded',
      })
      .returning();
    let live = 0;
    handlers['twin-replay'] = async () => (live++, { status: 'done', output: { replayed: 0 } });
    try {
      await enqueueStep(boss, t.db, 'twin-replay', { projectId: p!.id, force: true });
      const s = await until(
        () => step(p!.id, 'twin-replay'),
        (x) => x?.status === 'done',
      );
      expect(live).toBe(1);
      expect(s!.output).toEqual({ replayed: 0 });
    } finally {
      delete handlers['twin-replay'];
    }
  });

  it('jobs of one type run at once: a recorded run does not wait behind a live one', async () => {
    // Each possession waits until both have started: one at a time, neither would ever finish.
    const [a, b] = [await project(), await project()];
    let started = 0;
    let release!: () => void;
    const both = new Promise<void>((r) => (release = r));
    handlers.possess = async () => {
      if (++started === 2) release();
      await Promise.race([
        both,
        new Promise((_, no) => setTimeout(() => no(new Error('alone')), 1500)),
      ]);
      return { status: 'done', output: {} };
    };
    await enqueueStep(boss, t.db, 'possess', { projectId: a });
    await enqueueStep(boss, t.db, 'possess', { projectId: b });
    for (const id of [a, b])
      await until(
        () => step(id, 'possess'),
        (s) => s?.status === 'done',
      );
    expect((await step(a, 'possess'))!.attempts).toBe(1);
    expect((await step(b, 'possess'))!.attempts).toBe(1);
  });

  it('retries a failed attempt, and the second attempt completes', async () => {
    const id = await project();
    let calls = 0;
    handlers.possess = async () => {
      calls++;
      if (calls === 1) throw new Error('the emulator did not boot');
      return { status: 'done', output: { ok: true } };
    };
    await enqueueStep(boss, t.db, 'possess', { projectId: id });
    const s = await until(
      () => step(id, 'possess'),
      (s) => s?.status === 'done',
    );
    expect(s!.attempts).toBe(2);
    expect(calls).toBe(2);
    // The step's status is written just before its event: wait for the event too.
    const states = await until(
      async () => (await listEvents(t.db, id)).map((e) => (e.payload as { state?: string }).state),
      (x) => x.includes('done'),
    );
    expect(states).toEqual(['started', 'retrying', 'started', 'done']);
  });

  it('an attempt that runs past its timeout fails; with no retries left, step and project fail', async () => {
    const id = await project();
    handlers.archaeology = (ctx) =>
      new Promise((_, reject) =>
        ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason)),
      );
    await enqueueStep(boss, t.db, 'archaeology', { projectId: id });
    const s = await until(
      () => step(id, 'archaeology'),
      (s) => s?.status === 'failed',
    );
    expect(s!.error).toMatch(/timed out after 1 s/);
    // The project's status follows the step's, a moment later (the loop writes the step first).
    const p = await until(
      async () => (await t.db.select().from(projects).where(eq(projects.id, id)))[0],
      (p) => p?.status !== 'running',
      10_000,
    );
    expect(p!.status).toBe('failed');
  });

  it('the idempotency key: the same step queued twice runs once, and a done step is not run again', async () => {
    const id = await project();
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    handlers.possess = async () => {
      calls++;
      await gate;
      return { status: 'done', output: { n: calls } };
    };
    const first = await enqueueStep(boss, t.db, 'possess', { projectId: id });
    await until(
      () => step(id, 'possess'),
      (s) => s?.status === 'running',
    );
    // Running: one more may wait behind it ("stately"), a third is refused.
    const second = await enqueueStep(boss, t.db, 'possess', { projectId: id });
    const third = await enqueueStep(boss, t.db, 'possess', { projectId: id });
    expect(first).toBeTruthy();
    expect([second, third].filter(Boolean)).toHaveLength(1);
    release();
    await until(
      () => step(id, 'possess'),
      (s) => s?.status === 'done',
    );
    // The queued duplicate finds the step done and does not run the handler again.
    await until(
      async () => (await listEvents(t.db, id)).filter((e) => e.type === 'log').length,
      (n) => n >= 1,
    );
    expect(calls).toBe(1);
    expect((await step(id, 'possess'))!.output).toEqual({ n: 1 });

    // Forced, it runs again (re-run one step alone, Prompt 39).
    await enqueueStep(boss, t.db, 'possess', { projectId: id, force: true });
    await until(
      () => step(id, 'possess'),
      (s) => (s?.output as { n?: number })?.n === 2,
    );
    expect(calls).toBe(2);
  });

  it('a step that is not built yet is "skipped" with its reason, never "done"', async () => {
    const id = await project();
    // The Living Soul's voice change is not built yet (Prompt 81).
    await enqueueStep(boss, t.db, 'voice-change', { projectId: id });
    const s = await until(
      () => step(id, 'voice-change'),
      (s) => s?.status === 'skipped',
    );
    expect(s!.error).toBeNull();
    expect(s!.output).toMatchObject({ reason: expect.stringMatching(/not built yet/) });
  });

  it('refuses job data that is not a project step', async () => {
    await expect(
      enqueueStep(boss, t.db, 'possess', { projectId: 'shifa' } as never),
    ).rejects.toThrow();
  });
});
