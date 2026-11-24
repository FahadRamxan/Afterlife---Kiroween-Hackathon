// Prompt 38: GET /api/projects/:id/live streams a project's events over a WebSocket. The
// worker's inserts reach the API through LISTEN/NOTIFY.
import { emitEvent, projects, uuidv7 } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type WebSocket from 'ws';
import { buildApp } from './app';
import { parseEnv } from './env';
import { PgLiveHub } from './live';

vi.setConfig({ testTimeout: 30_000 });

let t: TestDatabase;
let hub: PgLiveHub;
const apps: ReturnType<typeof buildApp>[] = [];
beforeAll(async () => {
  t = await freshDatabase();
  hub = await PgLiveHub.start(t.db, t.url);
});
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});
afterAll(async () => {
  await hub.close();
  await t.drop();
});

function app() {
  const a = buildApp(
    parseEnv({ WEB_ORIGINS: 'https://afterlife.example' }),
    { logger: false },
    { live: hub },
  );
  apps.push(a);
  return a;
}

async function project() {
  const [p] = await t.db
    .insert(projects)
    .values({ name: 'Shifa Medical Store', source: 'graveyard', sourceApp: 'shifa' })
    .returning();
  return p!.id;
}

/** Collects what the socket receives. */
function inbox(ws: WebSocket) {
  const got: { seq: number; type: string; payload: unknown }[] = [];
  ws.on('message', (m) => got.push(JSON.parse(String(m))));
  return {
    got,
    async until(n: number, ms = 10_000) {
      const end = Date.now() + ms;
      while (got.length < n) {
        if (Date.now() > end) throw new Error(`got ${got.length} of ${n} messages`);
        await new Promise((r) => setTimeout(r, 25));
      }
      return got;
    },
  };
}

const closed = (ws: WebSocket) =>
  new Promise<{ code: number; reason: string }>((r) =>
    ws.on('close', (code, reason) => r({ code, reason: String(reason) })),
  );

const log = (message: string) => ({ level: 'info' as const, message });

describe('GET /api/projects/:id/live', () => {
  it('replays the last 200 events, oldest first, then streams new ones as the worker writes them', async () => {
    const id = await project();
    for (let i = 0; i < 205; i++) await emitEvent(t.db, id, 'log', log(`old ${i}`));
    const a = app();
    await a.ready();
    const ws = await a.injectWS(`/api/projects/${id}/live`);
    const box = inbox(ws);
    const replay = await box.until(200);
    expect(replay.map((e) => (e.payload as { message: string }).message)).toEqual(
      Array.from({ length: 200 }, (_, i) => `old ${i + 5}`),
    );
    // A new event from "the worker" (another connection) arrives by itself.
    const screen = await emitEvent(t.db, id, 'screen', { fingerprint: 'fp_0000000000000001' });
    const all = await box.until(201);
    expect(all[200]).toMatchObject({ seq: screen.seq, type: 'screen' });
    // In order and without duplicates.
    const seqs = all.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((x, y) => x - y));
    expect(new Set(seqs).size).toBe(seqs.length);
    ws.terminate();
  });

  it('?after=<seq> resumes after a reconnect: only what was missed, nothing twice', async () => {
    const id = await project();
    const first = await emitEvent(t.db, id, 'log', log('seen'));
    const missed = await emitEvent(t.db, id, 'log', log('missed'));
    const a = app();
    await a.ready();
    const ws = await a.injectWS(`/api/projects/${id}/live?after=${first.seq}`);
    const got = await inbox(ws).until(1);
    await new Promise((r) => setTimeout(r, 300));
    expect(got.map((e) => e.seq)).toEqual([missed.seq]);
    ws.terminate();
  });

  it('does not mix projects: events of another project are not sent', async () => {
    const mine = await project();
    const other = await project();
    const a = app();
    await a.ready();
    const ws = await a.injectWS(`/api/projects/${mine}/live`);
    const box = inbox(ws);
    await emitEvent(t.db, other, 'log', log('not yours'));
    const e = await emitEvent(t.db, mine, 'log', log('yours'));
    await box.until(1);
    await new Promise((r) => setTimeout(r, 300));
    expect(box.got.map((x) => x.seq)).toEqual([e.seq]);
    ws.terminate();
  });

  it('closes with 4404 for an unknown project and 4400 for a bad id', async () => {
    const a = app();
    await a.ready();
    const unknown = await a.injectWS(`/api/projects/${uuidv7()}/live`);
    expect((await closed(unknown)).code).toBe(4404);
    const bad = await a.injectWS('/api/projects/shifa/live');
    expect((await closed(bad)).code).toBe(4400);
  });

  it('refuses a page from a site that is not ours (Origin), with 4403', async () => {
    const id = await project();
    const a = app();
    await a.ready();
    const ws = await a.injectWS(`/api/projects/${id}/live`, {
      headers: { origin: 'https://evil.example' },
    });
    expect((await closed(ws)).code).toBe(4403);
    const ok = await a.injectWS(`/api/projects/${id}/live`, {
      headers: { origin: 'https://afterlife.example' },
    });
    // Listen before the event is sent: a message that comes first would be missed.
    const got = inbox(ok);
    await emitEvent(t.db, id, 'log', log('hello'));
    await got.until(1);
    ok.terminate();
  });
});

describe('without a database', () => {
  it('closes with 4503: there are no live events to stream', async () => {
    const a = buildApp(parseEnv({}), { logger: false });
    apps.push(a);
    await a.ready();
    const ws = await a.injectWS(`/api/projects/${uuidv7()}/live`);
    expect(await closed(ws)).toMatchObject({ code: 4503 });
  });
});
