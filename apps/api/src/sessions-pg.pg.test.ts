// Séances in Postgres (Prompt 35 replaces the in-memory store): the same API, now kept across
// restarts, with every action as a row in `observations`.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { observations, sessions, uuidv7, eq } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { FakeEmulator, buildBundle, recordAction, type SeanceSession } from '@afterlife/emulator';
import { renderScreen, type CellInput } from '@afterlife/screen';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { parseEnv } from './env';
import { PgProjectStore } from './projects-pg';
import { PgSessionStore } from './sessions-pg';

function screen(title: string) {
  const cells: CellInput[][] = Array.from({ length: 25 }, (_, r) =>
    Array.from({ length: 80 }, () => ({ code: 0x20, fg: 15, bg: r === 0 ? 3 : 1 })),
  );
  [...title].forEach((ch, k) => (cells[0]![36 + k]!.code = ch.charCodeAt(0)));
  return renderScreen({ cellWidth: 8, cellHeight: 16, cells });
}

const DIST = resolve(__dirname, '../../../samples/graveyard/dist/shifa');

/** A séance recorded on the fake emulator over the real Shifa files. */
async function session(n: number): Promise<SeanceSession> {
  const emu = new FakeEmulator({ screen: screen('MAIN MENU') });
  await emu.boot(
    buildBundle({
      executable: 'SHIFA.EXE',
      files: {
        'SHIFA.EXE': new Uint8Array(readFileSync(resolve(DIST, 'SHIFA.EXE'))),
        'BILLS.DBF': new Uint8Array(readFileSync(resolve(DIST, 'BILLS.DBF'))),
      },
    }),
  );
  const actions = [];
  for (let i = 0; i < n; i++)
    actions.push(await recordAction(emu, i % 2 ? '{Esc}' : '2', { stableMs: 10, pollMs: 2 }));
  return { projectId: 'shifa', startedAt: '2026-11-18T10:00:00.123Z', actions };
}

let t: TestDatabase;
let store: PgSessionStore;
beforeAll(async () => {
  t = await freshDatabase();
  store = new PgSessionStore(t.db);
});
afterAll(() => t.drop());

describe('PgSessionStore', () => {
  it('gives back the séance it saved, action for action', async () => {
    const s = await session(4);
    const id = await store.create(s);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(await store.get(id)).toEqual(s);
  });

  it('keeps the voice note as bytes, and gives it back as the same base64', async () => {
    const bytes = Uint8Array.from({ length: 3000 }, (_, i) => (i * 7) % 256);
    const s = {
      ...(await session(1)),
      audio: { mime: 'audio/webm;codecs=opus', base64: Buffer.from(bytes).toString('base64') },
    };
    const id = await store.create(s);
    expect(await store.get(id)).toEqual(s);
    const [row] = await t.db.select().from(sessions).where(eq(sessions.id, id));
    expect(row!.audio).toEqual(bytes);
  });

  it('writes one observations row per action, in order, with the screen fingerprints', async () => {
    const s = await session(3);
    const id = await store.create(s);
    const rows = await t.db
      .select()
      .from(observations)
      .where(eq(observations.sessionId, id))
      .orderBy(observations.seq);
    expect(rows.map((r) => [r.seq, r.keys, r.screenAfterFp])).toEqual(
      s.actions.map((a, i) => [i, a.keys, a.screenAfter.fingerprint]),
    );
  });

  it('answers null for an id it does not have', async () => {
    expect(await store.get(uuidv7())).toBeNull();
  });
});

describe('a séance recorded on a raised project (review 31-40, finding 1)', () => {
  it('is linked to it: in its timeline, and deleted with it', async () => {
    const env = parseEnv({ WEB_ORIGINS: 'https://afterlife.example' });
    const app = buildApp(
      env,
      { logger: false },
      {
        sessions: new PgSessionStore(t.db),
        projects: new PgProjectStore(t.db),
      },
    );
    try {
      const p = (
        await app.inject({
          method: 'POST',
          url: '/api/projects',
          payload: { source: 'graveyard', app: 'shifa' },
        })
      ).json();
      const s = { ...(await session(1)), raisedProjectId: p.id };
      const res = await app.inject({ method: 'POST', url: '/api/sessions', payload: s });
      expect(res.statusCode).toBe(201);
      const [row] = await t.db.select().from(sessions).where(eq(sessions.id, res.json().id));
      expect(row!.projectId).toBe(p.id);
      expect(
        (await app.inject({ method: 'GET', url: `/api/sessions/${res.json().id}` })).json(),
      ).toMatchObject({
        raisedProjectId: p.id,
      });
      const tl = (
        await app.inject({ method: 'GET', url: `/api/projects/${p.id}/timeline` })
      ).json();
      expect(tl.events.map((e: { kind: string }) => e.kind)).toEqual([
        'project_created',
        'session_recorded',
      ]);

      await app.inject({ method: 'DELETE', url: `/api/projects/${p.id}` });
      expect(await t.db.select().from(sessions).where(eq(sessions.id, res.json().id))).toEqual([]);
      expect(
        (await app.inject({ method: 'GET', url: `/api/sessions/${res.json().id}` })).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('a project that does not exist is a 404, and nothing is saved', async () => {
    const app = buildApp(
      parseEnv({}),
      { logger: false },
      {
        sessions: new PgSessionStore(t.db),
        projects: new PgProjectStore(t.db),
      },
    );
    try {
      const before = (await t.db.select().from(sessions)).length;
      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: { ...(await session(1)), raisedProjectId: uuidv7() },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('NO_PROJECT');
      expect((await t.db.select().from(sessions)).length).toBe(before);
    } finally {
      await app.close();
    }
  });
});

describe('the séance storage cap on Postgres (finding 2)', () => {
  it('counts the bytes stored, and refuses a séance that would pass the cap with 507', async () => {
    const store = new PgSessionStore(t.db);
    const before = await store.usedBytes();
    const s = await session(2);
    const size = Buffer.byteLength(JSON.stringify(s));
    const app = buildApp(
      parseEnv({ SEANCE_STORAGE_MB: '1' }),
      { logger: false },
      { sessions: store },
    );
    try {
      // The cap is 1 MB; the database already holds `before` bytes from the tests above.
      const fits = before + size <= 1024 * 1024;
      const res = await app.inject({ method: 'POST', url: '/api/sessions', payload: s });
      expect(res.statusCode).toBe(fits ? 201 : 507);
      if (fits) expect(await store.usedBytes()).toBe(before + size);
      const big = {
        ...s,
        audio: { mime: 'audio/webm', base64: 'A'.repeat(1_200_000) },
      };
      const full = await app.inject({ method: 'POST', url: '/api/sessions', payload: big });
      expect(full.statusCode).toBe(507);
      expect(full.json()).toMatchObject({
        error: 'STORAGE_FULL',
        message: expect.stringMatching(/full/),
      });
    } finally {
      await app.close();
    }
  });
});

describe('the sessions API on Postgres', () => {
  it('a séance saved by one API process is read back by a new one (it survives a restart)', async () => {
    const env = parseEnv({ WEB_ORIGINS: 'https://afterlife.example' });
    const s = await session(2);
    const first = buildApp(env, { logger: false }, { sessions: new PgSessionStore(t.db) });
    const res = await first.inject({ method: 'POST', url: '/api/sessions', payload: s });
    expect(res.statusCode).toBe(201);
    await first.close();
    const second = buildApp(env, { logger: false }, { sessions: new PgSessionStore(t.db) });
    const got = await second.inject({ method: 'GET', url: `/api/sessions/${res.json().id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toEqual({ id: res.json().id, ...s });
    await second.close();
  });
});
