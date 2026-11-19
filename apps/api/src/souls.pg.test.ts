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

  it('every change is a new version: listed with what changed, each readable, and comparable', async () => {
    const id = await project();
    await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/souls`,
      payload: SHIFA_REFERENCE_SOUL,
    });
    const changed = {
      ...SHIFA_REFERENCE_SOUL,
      provenance: { ...SHIFA_REFERENCE_SOUL.provenance, createdBy: 'owner' as const },
      rules: [
        {
          ...SHIFA_REFERENCE_SOUL.rules[0]!,
          expression: 'if bill.subtotal > 10000 then trunc(bill.subtotal * 0.10, 2) else 0',
        },
        ...SHIFA_REFERENCE_SOUL.rules.slice(2),
      ],
    };
    expect(
      (
        await app.inject({ method: 'POST', url: `/api/projects/${id}/souls`, payload: changed })
      ).json(),
    ).toEqual({
      version: 2,
    });

    const list = (await app.inject({ method: 'GET', url: `/api/projects/${id}/souls` })).json()
      .versions;
    expect(
      list.map((v: { version: number; createdBy: string }) => [v.version, v.createdBy]),
    ).toEqual([
      [2, 'owner'],
      [1, 'reference'],
    ]);
    expect(list[0].changes).toEqual({
      added: 0,
      removed: 1,
      changed: 1,
      entities: 0,
      screens: 0,
      actions: 0,
    });
    expect(list[1].changes).toBeNull();

    const one = (await app.inject({ method: 'GET', url: `/api/projects/${id}/souls/1` })).json();
    expect(one.soul.rules).toHaveLength(SHIFA_REFERENCE_SOUL.rules.length);
    const two = (await app.inject({ method: 'GET', url: `/api/projects/${id}/souls/2` })).json();
    expect(two.soul.provenance.parentVersion).toBe(1);

    const cmp = (
      await app.inject({ method: 'GET', url: `/api/projects/${id}/souls/compare?from=1&to=2` })
    ).json();
    expect(cmp.diff.rules.removed).toEqual(['gst-17-truncated']);
    expect(cmp.diff.rules.changed.map((c: { id: string }) => c.id)).toEqual(['discount-over-5000']);
    expect(
      (await app.inject({ method: 'GET', url: `/api/projects/${id}/souls/compare?from=1&to=9` }))
        .statusCode,
    ).toBe(404);
  });

  it('versions are immutable: the database refuses an edit, and an old version reads the same later', async () => {
    const id = await project();
    await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/souls`,
      payload: SHIFA_REFERENCE_SOUL,
    });
    const before = (await app.inject({ method: 'GET', url: `/api/projects/${id}/souls/1` })).json();
    const edit = await t.db
      .update(soulsTable)
      .set({ specMarkdown: 'edited' })
      .where(eq(soulsTable.projectId, id))
      .then(
        () => null,
        (e: Error & { cause?: Error }) => e.cause?.message ?? e.message,
      );
    expect(edit).toMatch(/Soul versions are immutable/);
    await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/souls`,
      payload: SHIFA_REFERENCE_SOUL,
    });
    expect(
      (await app.inject({ method: 'GET', url: `/api/projects/${id}/souls/1` })).json(),
    ).toEqual(before);
    // Deleting the project still deletes its versions.
    await app.inject({ method: 'DELETE', url: `/api/projects/${id}` });
    expect(await t.db.select().from(soulsTable).where(eq(soulsTable.projectId, id))).toEqual([]);
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
