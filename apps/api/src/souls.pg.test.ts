// Prompt 44: a project's Soul and the observations its rules point at.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { souls as soulsTable, eq } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { FakeEmulator, buildBundle, recordAction, type SeanceSession } from '@afterlife/emulator';
import { renderScreen, type CellInput } from '@afterlife/screen';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SHIFA_REFERENCE_SOUL } from '../../../packages/soul/src/examples/shifa';
import { buildApp } from './app';
import { parseEnv } from './env';
import { PgProjectStore } from './projects-pg';
import { PgSessionStore } from './sessions-pg';
import { PgSoulStore } from './souls';

function screen(title: string) {
  const cells: CellInput[][] = Array.from({ length: 25 }, (_, r) =>
    Array.from({ length: 80 }, () => ({ code: 0x20, fg: 15, bg: r === 0 ? 3 : 1 })),
  );
  [...title].forEach((ch, k) => (cells[0]![36 + k]!.code = ch.charCodeAt(0)));
  return renderScreen({ cellWidth: 8, cellHeight: 16, cells });
}

let t: TestDatabase;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => {
  t = await freshDatabase();
  app = buildApp(
    parseEnv({}),
    { logger: false },
    {
      projects: new PgProjectStore(t.db),
      sessions: new PgSessionStore(t.db),
      souls: new PgSoulStore(t.db),
    },
  );
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

async function project() {
  return (
    await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { source: 'graveyard', app: 'shifa' },
    })
  ).json().id as string;
}

async function seance(projectId: string): Promise<string> {
  const emu = new FakeEmulator({
    screen: screen('MAIN MENU'),
    onKeys: (_k, a) => a.setScreen(screen('STOCK')),
  });
  const exe = new Uint8Array(
    readFileSync(resolve(__dirname, '../../../samples/graveyard/dist/shifa/SHIFA.EXE')),
  );
  await emu.boot(buildBundle({ executable: 'SHIFA.EXE', files: { 'SHIFA.EXE': exe } }));
  const s: SeanceSession = {
    projectId: 'shifa',
    raisedProjectId: projectId,
    startedAt: '2026-11-19T10:00:00.000Z',
    actions: [await recordAction(emu, '2', { stableMs: 10, pollMs: 2 })],
  };
  return (await app.inject({ method: 'POST', url: '/api/sessions', payload: s })).json().id;
}

describe('souls and observations', () => {
  it('a project has no Soul until one is written: 404 NO_SOUL', async () => {
    const id = await project();
    const res = await app.inject({ method: 'GET', url: `/api/projects/${id}/soul` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('NO_SOUL');
  });

  it('a Soul is checked, numbered version 1, and read back with its observations as evidence', async () => {
    const id = await project();
    await seance(id);
    const obs = (
      await app.inject({ method: 'GET', url: `/api/projects/${id}/observations` })
    ).json().observations;
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({ seq: 0, keys: '2', before: 'MAIN MENU', after: 'STOCK' });

    const soul = {
      ...SHIFA_REFERENCE_SOUL,
      rules: SHIFA_REFERENCE_SOUL.rules.map((r) => ({ ...r, evidence: [obs[0].id] })),
    };
    const put = await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/souls`,
      payload: soul,
    });
    expect(put.statusCode).toBe(201);
    expect(put.json()).toEqual({ version: 1 });

    const got = (await app.inject({ method: 'GET', url: `/api/projects/${id}/soul` })).json();
    expect(got.version).toBe(1);
    expect(got.soul.rules[0].evidence).toEqual([obs[0].id]);
    // Stored with its Kiro spec's requirements.
    const [row] = await t.db.select().from(soulsTable).where(eq(soulsTable.projectId, id));
    expect(row!.specMarkdown).toMatch(/^# Requirements/);

    const one = (await app.inject({ method: 'GET', url: `/api/observations/${obs[0].id}` })).json();
    expect(one).toMatchObject({ id: obs[0].id, keys: '2' });
    expect(one.screenAfter.text[0]).toContain('STOCK');
    expect(one.dbfDiff).toBeDefined();
  });

  it('refuses a Soul that is not valid, saying why, and stores nothing', async () => {
    const id = await project();
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/souls`,
      payload: {
        ...SHIFA_REFERENCE_SOUL,
        rules: [{ ...SHIFA_REFERENCE_SOUL.rules[0]!, expression: '1 +' }],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'BAD_SOUL',
      message: expect.stringMatching(/rules.0.expression/),
    });
    expect((await app.inject({ method: 'GET', url: `/api/projects/${id}/soul` })).statusCode).toBe(
      404,
    );
  });

  it('an observation of another project, or none, is a 404', async () => {
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/observations/0192f5a0-0000-7000-8000-00000000abcd',
        })
      ).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/observations/nope' })).statusCode).toBe(
      400,
    );
  });
});
