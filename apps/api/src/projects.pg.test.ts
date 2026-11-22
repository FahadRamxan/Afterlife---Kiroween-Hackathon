// Prompt 36: projects in Postgres. The same contract as the memory store, plus what only a
// database has: the timeline from the other tables, and deletes that cascade.
import {
  observations,
  pipelineSteps,
  seed,
  SEED_PROJECTS,
  sessions,
  souls,
  eq,
  uuidv7,
} from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { parseEnv } from './env';
import { projectStoreContract } from './projects-contract';
import { PgPipeline } from './pipeline';
import { PgProjectStore } from './projects-pg';

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
  await seed(t.db);
});
afterAll(() => t.drop());

projectStoreContract('postgres', () => new PgProjectStore(t.db));

describe('the steps of a project', () => {
  it('GET steps lists the six in order; POST run queues one alone, and not twice', async () => {
    const pipeline = await PgPipeline.start(t.db, t.url, { warn: () => {} });
    const app = buildApp(
      parseEnv({}),
      { logger: false },
      { projects: new PgProjectStore(t.db), pipeline },
    );
    try {
      const p = (
        await app.inject({
          method: 'POST',
          url: '/api/projects',
          payload: { source: 'graveyard', app: 'iqra' },
        })
      ).json();
      // As the worker would leave it: possess skipped, with its reason.
      await t.db
        .update(pipelineSteps)
        .set({ status: 'skipped', output: { reason: 'Exploration is not built yet (Prompt 48)' } })
        .where(eq(pipelineSteps.projectId, p.id));
      const steps = (await app.inject({ method: 'GET', url: `/api/projects/${p.id}/steps` })).json()
        .steps;
      expect(steps.map((s: { step: string; status: string }) => `${s.step}:${s.status}`)).toEqual([
        'possess:skipped',
        'archaeology:pending',
        'rebirth:pending',
        'undertake:pending',
        'prove:pending',
        'exorcise:pending',
      ]);
      expect(steps[0]).toMatchObject({
        reason: 'Exploration is not built yet (Prompt 48)',
        recorded: false,
      });

      const run = () =>
        app.inject({ method: 'POST', url: `/api/projects/${p.id}/steps/rebirth/run` });
      expect((await run()).statusCode).toBe(202);
      expect((await run()).statusCode).toBe(409);
      const after = (await app.inject({ method: 'GET', url: `/api/projects/${p.id}/steps` })).json()
        .steps;
      expect(after[2]).toMatchObject({ step: 'rebirth', status: 'queued', vessel: null });
      // @spec surgeon#3.1 The rebirth step, done: the reborn app at this project's own URL, with
      // the actions that passed their smoke tests (also when its output is a recorded run's).
      await t.db
        .update(pipelineSteps)
        .set({
          status: 'done',
          output: {
            url: '/vessel/another-project',
            published: true,
            actions: [
              { id: 'save-bill', name: 'Save a bill', ok: true },
              { id: 'add-customer', name: 'Add a customer', ok: false },
            ],
          },
        })
        .where(eq(pipelineSteps.step, 'rebirth'));
      const reborn = (
        await app.inject({ method: 'GET', url: `/api/projects/${p.id}/steps` })
      ).json().steps[2];
      expect(reborn.vessel).toEqual({
        url: `/vessel/${p.id}`,
        actions: [{ id: 'save-bill', name: 'Save a bill' }],
      });
      expect(steps[0].vessel).toBeNull();
      expect(
        (await app.inject({ method: 'GET', url: `/api/projects/${uuidv7()}/steps` })).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
      await pipeline.close();
    }
  });
});

describe('raising starts the pipeline', () => {
  it('POST /api/projects queues the first step (possess) for the worker', async () => {
    const pipeline = await PgPipeline.start(t.db, t.url, { warn: () => {} });
    const app = buildApp(
      parseEnv({}),
      { logger: false },
      { projects: new PgProjectStore(t.db), pipeline },
    );
    try {
      const p = (
        await app.inject({
          method: 'POST',
          url: '/api/projects',
          payload: { source: 'graveyard', app: 'shifa' },
        })
      ).json();
      const steps = await t.db
        .select()
        .from(pipelineSteps)
        .where(eq(pipelineSteps.projectId, p.id));
      expect(steps).toEqual([
        expect.objectContaining({ step: 'possess', status: 'queued', attempts: 0 }),
      ]);
      expect(steps[0]!.jobId).toBeTruthy();
    } finally {
      await app.close();
      await pipeline.close();
    }
  });
});

describe('PgProjectStore', () => {
  it('the timeline lists séances and Soul versions in time order after "project created"', async () => {
    const store = new PgProjectStore(t.db);
    const p = await store.create({
      name: 'Shifa Medical Store',
      source: 'graveyard',
      sourceApp: 'shifa',
    });
    const at = (s: number) => new Date(new Date(p.createdAt).getTime() + s * 1000);
    const [s] = await t.db
      .insert(sessions)
      .values({ projectId: p.id, app: 'shifa', startedAt: at(1), createdAt: at(2) })
      .returning();
    await t.db
      .insert(souls)
      .values({ projectId: p.id, version: 1, ir: {}, specMarkdown: '', createdAt: at(3) });
    const tl = await store.timeline(p.id);
    expect(tl!.map((e) => e.kind)).toEqual(['project_created', 'session_recorded', 'soul_version']);
    expect(tl![1]).toMatchObject({ id: s!.id, at: at(2).toISOString(), summary: 'shifa' });
    expect(tl![2]!.summary).toBe('version 1');
  });

  it('deleting a project through the API deletes its séances and their observations', async () => {
    const app = buildApp(parseEnv({}), { logger: false }, { projects: new PgProjectStore(t.db) });
    try {
      const p = (
        await app.inject({
          method: 'POST',
          url: '/api/projects',
          payload: { source: 'graveyard', app: 'iqra' },
        })
      ).json();
      const [s] = await t.db
        .insert(sessions)
        .values({ projectId: p.id, app: 'iqra', startedAt: new Date() })
        .returning();
      const screen = { fingerprint: 'fp_0000000000000000' };
      await t.db.insert(observations).values({
        sessionId: s!.id,
        seq: 0,
        keys: '1',
        screenBeforeFp: screen.fingerprint,
        screenAfterFp: screen.fingerprint,
        screenBefore: screen,
        screenAfter: screen,
        dbfDiff: {},
        durationMs: 1,
        stable: true,
      });
      expect(
        (await app.inject({ method: 'DELETE', url: `/api/projects/${p.id}` })).statusCode,
      ).toBe(204);
      expect(await t.db.select().from(sessions).where(eq(sessions.id, s!.id))).toEqual([]);
      expect(
        await t.db.select().from(observations).where(eq(observations.sessionId, s!.id)),
      ).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('the seeded Graveyard projects can be read and are never deleted', async () => {
    const app = buildApp(parseEnv({}), { logger: false }, { projects: new PgProjectStore(t.db) });
    try {
      const id = SEED_PROJECTS[0].id;
      expect(
        (await app.inject({ method: 'GET', url: `/api/projects/${id}` })).json(),
      ).toMatchObject({
        name: 'Shifa Medical Store',
      });
      expect((await app.inject({ method: 'DELETE', url: `/api/projects/${id}` })).statusCode).toBe(
        403,
      );
      expect((await app.inject({ method: 'GET', url: `/api/projects/${id}` })).statusCode).toBe(
        200,
      );
    } finally {
      await app.close();
    }
  });
});
