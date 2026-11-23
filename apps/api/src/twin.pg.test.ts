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
beforeAll(async () => {
  t = await freshDatabase();
  store = new PgProjectStore(t.db);
  app = buildApp(parseEnv({}), { logger: false }, { projects: store, twin: new PgTwinStore(t.db) });
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
      // The poster's fetch goes to this app, not the network.
      const fetcher = (async (url: string, init: RequestInit) => {
        const r = await app.inject({
          method: 'POST',
          url: new URL(url).pathname,
          payload: init.body as string,
          headers: init.headers as Record<string, string>,
        });
        return new Response(r.body, { status: r.statusCode });
      }) as unknown as typeof fetch;
      const c = createCapture({
        dir,
        post: httpPoster({ api: 'http://api', projectId: id, token: tok, fetcher }),
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
});
