// Prompt 52: GET /api/projects/:id/screen-graph gives the kept screen graph.
import { saveGraph } from '@afterlife/crew';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { parseEnv } from './env';
import { PgProjectStore } from './projects-pg';
import { PgScreenGraphStore } from './screen-graph';

let t: TestDatabase;
let app: ReturnType<typeof buildApp>;
let projects: PgProjectStore;
beforeAll(async () => {
  t = await freshDatabase();
  projects = new PgProjectStore(t.db);
  app = buildApp(
    parseEnv({}),
    { logger: false },
    { projects, screenGraphs: new PgScreenGraphStore(t.db) },
  );
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

describe('GET /api/projects/:id/screen-graph', () => {
  it('is the kept graph: its screens and the keys between them', async () => {
    const p = await projects.create({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' });
    await saveGraph(t.db, p.id, {
      root: 'fp_menu',
      nodes: [
        { fingerprint: 'fp_menu', title: 'MAIN MENU', firstSeen: 0, visits: 3 },
        { fingerprint: 'fp_stock', title: 'STOCK', firstSeen: 1, visits: 1 },
      ],
      edges: [
        { from: 'fp_menu', to: 'fp_stock', keys: '2', count: 1 },
        { from: 'fp_stock', to: 'fp_menu', keys: '{Esc}', count: 1 },
      ],
    });
    const res = await app.inject(`/api/projects/${p.id}/screen-graph`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      projectId: p.id,
      root: 'fp_menu',
      nodes: [{ title: 'MAIN MENU' }, { title: 'STOCK' }],
      edges: [{ keys: '2' }, { keys: '{Esc}' }],
    });
  });

  it('a project not possessed yet has none (404 NO_GRAPH), and bad ids are refused', async () => {
    const p = await projects.create({ name: 'Iqra', source: 'graveyard', sourceApp: 'iqra' });
    const none = await app.inject(`/api/projects/${p.id}/screen-graph`);
    expect(none.statusCode).toBe(404);
    expect(none.json().error).toBe('NO_GRAPH');
    expect((await app.inject('/api/projects/nope/screen-graph')).statusCode).toBe(400);
    expect(
      (await app.inject('/api/projects/0190a6d2-0000-7000-8000-000000000099/screen-graph'))
        .statusCode,
    ).toBe(404);
  });
});
