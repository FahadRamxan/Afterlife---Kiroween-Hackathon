import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FakeEmulator, buildBundle, recordAction, type SeanceSession } from '@afterlife/emulator';
import { renderScreen, type CellInput } from '@afterlife/screen';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { parseEnv } from './env';
import { MemorySessionStore } from './sessions';
import { uuidv7 } from '@afterlife/db';

function screen(title: string) {
  const cells: CellInput[][] = Array.from({ length: 25 }, (_, r) =>
    Array.from({ length: 80 }, () => ({ code: 0x20, fg: 15, bg: r === 0 ? 3 : 1 })),
  );
  [...title].forEach((ch, k) => (cells[0]![36 + k]!.code = ch.charCodeAt(0)));
  return renderScreen({ cellWidth: 8, cellHeight: 16, cells });
}

const DIST = resolve(__dirname, '../../../samples/graveyard/dist/shifa');
async function session(n = 2): Promise<SeanceSession> {
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
    actions.push(await recordAction(emu, '2', { stableMs: 10, pollMs: 2 }));
  return { projectId: 'shifa', startedAt: '2026-11-18T10:00:00.000Z', actions };
}

const app = buildApp(parseEnv({ WEB_ORIGINS: 'https://afterlife.example' }), { logger: false });
beforeAll(() => app.ready());
afterAll(() => app.close());

describe('MemorySessionStore', () => {
  it('keeps the newest sessions up to its limit', async () => {
    const store = new MemorySessionStore(2);
    const s = await session(1);
    const a = await store.create(s);
    const b = await store.create(s);
    const c = await store.create(s);
    expect(await store.get(a)).toBeNull();
    expect(await store.get(b)).not.toBeNull();
    expect(await store.get(c)).not.toBeNull();
  });
});

describe('the séance storage cap (memory)', () => {
  it('counts what is kept, and forgets the sizes of séances it drops', async () => {
    const store = new MemorySessionStore(2);
    const s = await session(1);
    await store.create(s, 100);
    await store.create(s, 200);
    expect(await store.usedBytes()).toBe(300);
    await store.create(s, 50);
    expect(await store.usedBytes()).toBe(250);
  });

  it('a full store answers 507 and says so; one that fits is saved', async () => {
    const a = buildApp(parseEnv({ SEANCE_STORAGE_MB: '1' }), { logger: false });
    try {
      const s = await session(1);
      expect(
        (await a.inject({ method: 'POST', url: '/api/sessions', payload: s })).statusCode,
      ).toBe(201);
      const res = await a.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: { ...s, audio: { mime: 'audio/webm', base64: 'A'.repeat(1_100_000) } },
      });
      expect(res.statusCode).toBe(507);
      expect(res.json()).toEqual({
        error: 'STORAGE_FULL',
        message: 'The séance storage is full (1 MB). Ask the owner of this site to make room.',
      });
    } finally {
      await a.close();
    }
  });
});

describe('POST /api/sessions and GET /api/sessions/:id', () => {
  it('refuses a raised project id that is not a project (404) or not an id (400)', async () => {
    const s = await session(1);
    const missing = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { ...s, raisedProjectId: uuidv7() },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toBe('NO_PROJECT');
    const bad = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { ...s, raisedProjectId: 'shifa' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('saves a séance and gives it back by its id', async () => {
    const s = await session(5);
    const res = await app.inject({ method: 'POST', url: '/api/sessions', payload: s });
    expect(res.statusCode).toBe(201);
    const { id, actions } = res.json();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(actions).toBe(5);
    const got = await app.inject({ method: 'GET', url: `/api/sessions/${id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toEqual({ id, ...s });
  });

  it('refuses a séance that is not valid, saying why', async () => {
    const s = await session(1);
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { ...s, actions: [{ ...s.actions[0]!, keys: '{Nope}' }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'BAD_SESSION' });
    expect(res.json().message).toMatch(/actions\.0\.keys/);
  });

  it('answers 404 for an unknown id and 400 for something that is not an id', async () => {
    expect((await app.inject({ method: 'GET', url: `/api/sessions/${uuidv7()}` })).statusCode).toBe(
      404,
    );
    expect((await app.inject({ method: 'GET', url: '/api/sessions/..%2Fetc' })).statusCode).toBe(
      400,
    );
  });

  it('refuses a body over the limit with 413', async () => {
    const s = await session(1);
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { ...s, audio: { mime: 'audio/webm', base64: 'A'.repeat(9_000_000) } },
    });
    expect(res.statusCode).toBe(413);
  });
});
