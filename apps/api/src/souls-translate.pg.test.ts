// Prompt 46: POST /api/projects/:id/soul/translate queues the worker's Urdu translation.
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SHIFA_REFERENCE_SOUL } from '../../../packages/soul/src/examples/shifa';
import { buildApp } from './app';
import { parseEnv } from './env';
import type { Pipeline } from './projects';
import { PgProjectStore } from './projects-pg';
import { PgSoulStore } from './souls';

let t: TestDatabase;
const translate = vi.fn((id: string) => Promise.resolve(id.length > 0));
const pipeline: Pipeline = {
  start: async () => {},
  steps: async () => [],
  rerun: async () => true,
  translate: (id) => translate(id),
};
let app: ReturnType<typeof buildApp>;
let projects: PgProjectStore;
beforeAll(async () => {
  t = await freshDatabase();
  projects = new PgProjectStore(t.db);
  app = buildApp(
    parseEnv({}),
    { logger: false },
    { projects, souls: new PgSoulStore(t.db), pipeline },
  );
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

const newProject = () =>
  projects.create({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' });

describe('POST /api/projects/:id/soul/translate', () => {
  it('queues the translation of a project that has a Soul', async () => {
    const p = await newProject();
    await app.inject({
      method: 'POST',
      url: `/api/projects/${p.id}/souls`,
      payload: SHIFA_REFERENCE_SOUL,
    });
    const res = await app.inject({ method: 'POST', url: `/api/projects/${p.id}/soul/translate` });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ queued: true });
    expect(translate).toHaveBeenCalledWith(p.id);
  });

  it('says when there is nothing to translate, or it is already waiting', async () => {
    const p = await newProject();
    const none = await app.inject({ method: 'POST', url: `/api/projects/${p.id}/soul/translate` });
    expect(none.statusCode).toBe(404);
    expect(none.json().error).toBe('NO_SOUL');
    await app.inject({
      method: 'POST',
      url: `/api/projects/${p.id}/souls`,
      payload: SHIFA_REFERENCE_SOUL,
    });
    translate.mockResolvedValueOnce(false);
    const again = await app.inject({ method: 'POST', url: `/api/projects/${p.id}/soul/translate` });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('ALREADY_QUEUED');
  });

  it('an API that cannot reach the worker says so', async () => {
    const bare = buildApp(
      parseEnv({}),
      { logger: false },
      { projects, souls: new PgSoulStore(t.db) },
    );
    const p = await newProject();
    await bare.inject({
      method: 'POST',
      url: `/api/projects/${p.id}/souls`,
      payload: SHIFA_REFERENCE_SOUL,
    });
    const res = await bare.inject({ method: 'POST', url: `/api/projects/${p.id}/soul/translate` });
    expect(res.statusCode).toBe(503);
    await bare.close();
  });
});
