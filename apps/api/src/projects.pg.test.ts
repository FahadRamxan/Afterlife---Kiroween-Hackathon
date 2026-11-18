// Prompt 36: projects in Postgres. The same contract as the memory store, plus what only a
// database has: the timeline from the other tables, and deletes that cascade.
import { observations, seed, SEED_PROJECTS, sessions, souls } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { parseEnv } from './env';
import { projectStoreContract } from './projects-contract';
import { PgProjectStore } from './projects-pg';

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
  await seed(t.db);
});
afterAll(() => t.drop());

projectStoreContract('postgres', () => new PgProjectStore(t.db));

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
