// @spec ghost-twin#1.3 The API takes the shop's twin events (Prompt 76): only with the project's
// twin token, kept as a hash; each one stored in order and announced as a `twin` event.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeDbf, type DbfTable } from '@afterlife/dbf';
import { eq, listEvents, projects, twinEvents } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { createCapture, httpPoster } from '@afterlife/twin';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { parseEnv } from './env';
import { PgProjectStore } from './projects-pg';
import { PgTwinStore } from './twin';

let t: TestDatabase;
let app: ReturnType<typeof buildApp>;
let store: PgProjectStore;
// @spec ghost-twin#2.1 Each event stored queues its replay (Prompt 77).
const replays: string[] = [];
beforeAll(async () => {
  t = await freshDatabase();
  store = new PgProjectStore(t.db);
  app = buildApp(
    parseEnv({}),
    { logger: false },
    {
      projects: store,
      twin: new PgTwinStore(t.db),
      pipeline: {
        start: async () => {},
        steps: async () => [],
        rerun: async () => true,
        twin: async (id) => (replays.push(id), true),
      },
    },
  );
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await t.drop();
});
const project = async () =>
  (await store.create({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' })).id;
const token = async (id: string) =>
  (await app.inject({ method: 'POST', url: `/api/projects/${id}/twin/token` })).json()
    .token as string;
const EMPTY = { tables: {}, unchanged: [], addedTables: [], removedTables: [] };
const NO_SCHEMA = { added: [], removed: [] };
const event = (seq: number) => ({
  seq,
  occurredAt: '1998-07-15T10:00:00.000Z',
  files: ['MEDICINE.DBF'],
  diff: EMPTY,
});
const post = (id: string, body: unknown, tok?: string) =>
  app.inject({
    method: 'POST',
    url: `/api/projects/${id}/twin/events`,
    payload: body as object,
    headers: tok ? { authorization: `Bearer ${tok}` } : {},
  });

describe('the twin routes', () => {
  it('makes a token, shown once; only its hash is kept', async () => {
    const id = await project();
    const r = await app.inject({ method: 'POST', url: `/api/projects/${id}/twin/token` });
    expect(r.statusCode).toBe(201);
    const tok = r.json().token as string;
    expect(tok).toMatch(/^tw_[A-Za-z0-9_-]{43}$/);
    const [row] = await t.db.select().from(projects).where(eq(projects.id, id));
    expect(row!.twinTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.twinTokenHash).not.toContain(tok);
    // A new token replaces the old one.
    const again = await token(id);
    expect((await post(id, event(1), tok)).statusCode).toBe(401);
    expect((await post(id, event(1), again)).statusCode).toBe(201);
  });

  it('takes events with the token: stored in order, announced, listed; a seq twice is 409', async () => {
    const id = await project();
    const tok = await token(id);
    expect((await post(id, event(1), tok)).statusCode).toBe(201);
    expect((await post(id, event(2), tok)).statusCode).toBe(201);
    expect((await post(id, event(2), tok)).statusCode).toBe(409);
    // Each new event queued its replay in the reborn app; the duplicate did not.
    expect(replays.filter((x) => x === id)).toHaveLength(2);
    const rows = await t.db.select().from(twinEvents).where(eq(twinEvents.projectId, id));
    expect(rows.map((r) => r.seq).sort()).toEqual([1, 2]);
    expect(rows[0]!.occurredAt.toISOString()).toBe('1998-07-15T10:00:00.000Z');
    const live = (await listEvents(t.db, id)).filter((e) => e.type === 'twin');
    expect(live.map((e) => (e.payload as { seq: number }).seq)).toEqual([1, 2]);
    const list = (
      await app.inject({ method: 'GET', url: `/api/projects/${id}/twin/events` })
    ).json();
    expect(list.events.map((e: { seq: number }) => e.seq)).toEqual([1, 2]);
    expect(list.events[0]).toMatchObject({ files: ['MEDICINE.DBF'], matched: null });
  });

  it("lists what the old app changed in each file, for the twin feed's old side", async () => {
    const id = await project();
    const tok = await token(id);
    const rec = { ITEM: 'ORS001', QTY: 3 };
    const diff = {
      ...EMPTY,
      tables: {
        'BILLS.DBF': {
          key: 'BILLNO',
          inserted: [rec],
          updated: [],
          deleted: [],
          schema: NO_SCHEMA,
        },
        'MEDICINE.DBF': {
          key: 'CODE',
          schema: NO_SCHEMA,
          inserted: [],
          updated: [{ key: { CODE: 'ORS001' }, before: rec, after: rec, changed: ['QTY'] }],
          deleted: [],
        },
      },
    };
    const r = await post(id, { ...event(1), files: ['BILLS.DBF', 'MEDICINE.DBF'], diff }, tok);
    expect(r.statusCode).toBe(201);
    const list = (
      await app.inject({ method: 'GET', url: `/api/projects/${id}/twin/events` })
    ).json();
    expect(list.events[0].changes).toEqual({
      'BILLS.DBF': { inserted: 1, updated: 0, deleted: 0 },
      'MEDICINE.DBF': { inserted: 0, updated: 1, deleted: 0 },
    });
  });

  it("refuses no token, a wrong one, another project's, and a body that is not an event", async () => {
    const [a, b] = [await project(), await project()];
    const tokA = await token(a);
    await token(b);
    expect((await post(a, event(1))).statusCode).toBe(401);
    expect((await post(a, event(1), 'tw_wrong')).statusCode).toBe(401);
    expect((await post(b, event(1), tokA)).statusCode).toBe(401);
    expect((await post(a, { seq: 0, occurredAt: 'x', files: [], diff: {} }, tokA)).statusCode).toBe(
      400,
    );
    expect((await post(a, { ...event(1), files: ['../../etc/passwd'] }, tokA)).statusCode).toBe(
      400,
    );
    // A project with no token yet takes nothing.
    expect((await post(await project(), event(1), tokA)).statusCode).toBe(401);
  });

  it('the capture tool, watching a real folder, posts into the API (end to end)', async () => {
    const id = await project();
    const tok = await token(id);
    const dir = mkdtempSync(path.join(tmpdir(), 'twin-api-'));
    const table: DbfTable = {
      fields: [
        { name: 'CODE', type: 'C', length: 6, decimals: 0 },
        { name: 'QTY', type: 'N', length: 5, decimals: 0 },
      ],
      records: [{ deleted: false, values: { CODE: 'PAN500', QTY: '240' } }],
    };
    try {
      writeFileSync(path.join(dir, 'MEDICINE.DBF'), writeDbf(table));
      const c = createCapture({
        dir,
        post: httpPoster({ api: 'http://api', projectId: id, token: tok, fetcher: viaApp }),
      });
      await c.tick();
      writeFileSync(
        path.join(dir, 'MEDICINE.DBF'),
        writeDbf({
          ...table,
          records: [{ deleted: false, values: { CODE: 'PAN500', QTY: '238' } }],
        }),
      );
      await c.tick();
      expect(c.pending()).toBe(0);
      const [row] = await t.db.select().from(twinEvents).where(eq(twinEvents.projectId, id));
      expect(
        (row!.event as { diff: { tables: Record<string, unknown> } }).diff.tables['MEDICINE.DBF'],
      ).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a capture started again (the shop PC restarted) goes on from the newest change: none is lost', async () => {
    const id = await project();
    const tok = await token(id);
    const dir = mkdtempSync(path.join(tmpdir(), 'twin-restart-'));
    const table: DbfTable = {
      fields: [
        { name: 'CODE', type: 'C', length: 6, decimals: 0 },
        { name: 'QTY', type: 'N', length: 5, decimals: 0 },
      ],
      records: [{ deleted: false, values: { CODE: 'PAN500', QTY: '240' } }],
    };
    const sell = (qty: string) =>
      writeFileSync(
        path.join(dir, 'MEDICINE.DBF'),
        writeDbf({ ...table, records: [{ deleted: false, values: { CODE: 'PAN500', QTY: qty } }] }),
      );
    const capture = () =>
      createCapture({
        dir,
        post: httpPoster({ api: 'http://api', projectId: id, token: tok, fetcher: viaApp }),
      });
    try {
      writeFileSync(path.join(dir, 'MEDICINE.DBF'), writeDbf(table));
      const first = capture();
      await first.tick();
      sell('238');
      await first.tick();
      sell('236');
      await first.tick();
      // The PC restarts: a new capture, numbering its changes from 1 again.
      const second = capture();
      await second.tick();
      sell('230');
      await second.tick();
      expect(second.pending()).toBe(0);
      const rows = await t.db
        .select()
        .from(twinEvents)
        .where(eq(twinEvents.projectId, id))
        .orderBy(twinEvents.seq);
      expect(rows.map((r) => r.seq)).toEqual([1, 2, 3]);
      const after = (r: (typeof rows)[number]) =>
        (
          r.event as {
            diff: { tables: Record<string, { updated: { changes: { after: string }[] }[] }> };
          }
        ).diff.tables['MEDICINE.DBF']!.updated[0]!.changes[0]!.after;
      expect(rows.map(after)).toEqual(['238', '236', '230']);
      const o = (await app.inject({ method: 'GET', url: `/api/projects/${id}/twin` })).json();
      expect(o.lastSeq).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** The capture tool's fetch, sent to this app instead of the network. */
const viaApp = (async (url: string, init?: RequestInit) => {
  const r = await app.inject({
    method: (init?.method ?? 'GET') as 'GET' | 'POST',
    url: new URL(url).pathname,
    ...(init?.body ? { payload: init.body as string } : {}),
    headers: (init?.headers ?? {}) as Record<string, string>,
  });
  return new Response(r.body, { status: r.statusCode });
}) as unknown as typeof fetch;
