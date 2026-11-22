// @spec code-export#2 Export in the app.
// @spec code-export#2.1 GET /api/projects/:id/export: the reborn app as a zip (Prompt 62).
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { parseEnv } from './env';
import { PgExportStore, oldAppDate } from './export';
import { PgProjectStore } from './projects-pg';
import { PgSoulStore } from './souls';

let t: TestDatabase;
let app: ReturnType<typeof buildApp>;
let projects: PgProjectStore;
beforeAll(async () => {
  t = await freshDatabase();
  projects = new PgProjectStore(t.db);
  app = buildApp(
    parseEnv({}),
    { logger: false },
    {
      projects,
      souls: new PgSoulStore(t.db),
      exports: new PgExportStore(t.db, (id) => projects.get(id)),
    },
  );
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

const get = (id: string) => app.inject({ method: 'GET', url: `/api/projects/${id}/export` });

describe('GET /api/projects/:id/export', () => {
  it('a Graveyard project with a Soul: its reborn app, with the old app’s records and date', async () => {
    const p = await projects.create({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' });
    await new PgSoulStore(t.db).add(p.id, SHIFA_REFERENCE_SOUL);
    const r = await get(p.id);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/zip');
    expect(r.headers['content-disposition']).toBe('attachment; filename="shifa-reborn.zip"');
    const zip = unzipSync(new Uint8Array(r.rawPayload));
    expect(Object.keys(zip)).toContain('shifa-reborn/app/page.tsx');
    expect(Object.keys(zip)).toContain('shifa-reborn/.kiro/steering/legacy-behaviour.md');
    const medicine = JSON.parse(strFromU8(zip['shifa-reborn/data/MEDICINE.json']!)) as unknown[];
    expect(medicine).toHaveLength(40);
    expect(strFromU8(zip['shifa-reborn/lib/reborn.ts']!)).toContain(
      "export const OLD_APP_DATE = '1998-07-15';",
    );
  });

  it('says why when there is nothing to export yet', async () => {
    const none = await projects.create({ name: 'S', source: 'graveyard', sourceApp: 'shifa' });
    expect((await get(none.id)).json()).toMatchObject({ error: 'NO_SOUL' });
    expect((await get(none.id)).statusCode).toBe(409);
    const bare = await projects.create({ name: 'S', source: 'graveyard', sourceApp: 'shifa' });
    await new PgSoulStore(t.db).add(bare.id, { ...SHIFA_REFERENCE_SOUL, actions: [] });
    expect((await get(bare.id)).json()).toMatchObject({ error: 'NO_ACTIONS' });
    const upload = await projects.create({ name: 'U', source: 'upload', sourceApp: 'x.zip' });
    await new PgSoulStore(t.db).add(upload.id, SHIFA_REFERENCE_SOUL);
    expect((await get(upload.id)).json()).toMatchObject({ error: 'NO_DATA' });
    expect((await get('00000000-0000-7000-8000-000000000000')).statusCode).toBe(404);
    expect((await get('nope')).statusCode).toBe(400);
  });

  it('the old app’s date: the project’s clock, else its sample’s manifest', () => {
    expect(oldAppDate({ source: 'upload', sourceApp: 'x', dosTime: '2001-03-12 09:00:00' })).toBe(
      '2001-03-12',
    );
    expect(oldAppDate({ source: 'graveyard', sourceApp: 'iqra', dosTime: null })).toBe(
      '2001-03-12',
    );
    expect(oldAppDate({ source: 'graveyard', sourceApp: '../../etc', dosTime: null })).toBe(
      undefined,
    );
  });
});
