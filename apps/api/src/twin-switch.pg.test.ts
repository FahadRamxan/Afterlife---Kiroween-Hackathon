// @spec ghost-twin#3.2 Readiness on the API, a simulated shop day, and the switch-over (Prompt 78).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq, insertSoulVersion, projects, twinEvents } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { numberSoul, specRequirements } from '@afterlife/soul';
import { SHIFA_AS_IT_RUNS_SOUL } from '@afterlife/soul/examples/shifa';
import { tablesFromBundle } from '@afterlife/vessel';
import { PgEntityStore } from '@afterlife/vessel/postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { parseEnv } from './env';
import { PgProjectStore } from './projects-pg';
import { PgTwinStore } from './twin';
import { graveyardBundle } from './vessel';

const WEEK = JSON.parse(
  readFileSync(resolve(__dirname, '../../../samples/graveyard/shifa/twin-week.json'), 'utf8'),
) as {
  days: string[];
  events: { day: string }[];
};
let t: TestDatabase;
let app: ReturnType<typeof buildApp>;
let store: PgProjectStore;
beforeAll(async () => {
  t = await freshDatabase();
  store = new PgProjectStore(t.db);
  // Readiness at 1 day and 5 matched, so a test can reach it with the recorded first day.
  app = buildApp(
    parseEnv({ TWIN_READY_DAYS: '1', TWIN_READY_MATCHED: '5' }),
    { logger: false },
    { projects: store, twin: new PgTwinStore(t.db) },
  );
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await t.drop();
});
async function shifa() {
  const p = await store.create({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' });
  await insertSoulVersion(t.db, p.id, (v, parent) => {
    const s = numberSoul(SHIFA_AS_IT_RUNS_SOUL, p.id, v, parent);
    return { ir: s, specMarkdown: specRequirements(s) };
  });
  return p.id;
}
const overview = async (id: string) =>
  (await app.inject({ method: 'GET', url: `/api/projects/${id}/twin` })).json();
const simulate = (id: string) =>
  app.inject({ method: 'POST', url: `/api/projects/${id}/twin/simulate` });
const switchOver = (id: string, confirm = true) =>
  app.inject({ method: 'POST', url: `/api/projects/${id}/twin/switch`, payload: { confirm } });
/** As the worker's twin-replay would: every event compared and matched. */
const allMatched = (id: string) =>
  t.db
    .update(twinEvents)
    .set({ matched: true, newResult: { outcome: 'matched' } })
    .where(eq(twinEvents.projectId, id));

describe('readiness, a simulated day, and the switch-over', () => {
  it('a new twin: not ready, and says why; the recorded week is there to simulate', async () => {
    const id = await shifa();
    const o = await overview(id);
    expect(o).toMatchObject({
      primaryApp: 'old',
      switchedAt: null,
      hasToken: false,
      readiness: {
        ready: false,
        days: 0,
        matched: 0,
        rule: { days: 1, matched: 5, openMismatches: 0 },
      },
      simulate: { available: true, nextDay: WEEK.days[0], recordedDays: WEEK.days.length },
    });
    expect(o.days).toEqual([]);
  });

  it('simulating a day adds its recorded transactions, in order; readiness follows their replay', async () => {
    const id = await shifa();
    const r = await simulate(id);
    expect(r.statusCode).toBe(201);
    const day1 = WEEK.events.filter((e) => e.day === WEEK.days[0]).length;
    expect(r.json()).toEqual({ day: WEEK.days[0], events: day1 });
    let o = await overview(id);
    expect(o.readiness).toMatchObject({ pending: day1, ready: false });
    expect(o.days).toEqual([
      { date: WEEK.days[0], total: day1, matched: 0, mismatched: 0, unknown: 0, pending: day1 },
    ]);
    await allMatched(id);
    o = await overview(id);
    expect(o.readiness).toMatchObject({ days: 1, matched: day1, ready: true, score: 100 });
    expect(o.simulate.nextDay).toBe(WEEK.days[1] ?? null);
  });

  it('switch over: refused until ready; then the final migration, the Vessel primary, the old data frozen', async () => {
    const id = await shifa();
    const early = await switchOver(id);
    expect(early.statusCode).toBe(409);
    expect(early.json()).toMatchObject({ error: 'NOT_READY' });
    expect(early.json().message).toContain('more matched transactions');
    await simulate(id);
    await allMatched(id);
    expect((await switchOver(id, false)).statusCode).toBe(400);
    const r = await switchOver(id);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      primaryApp: 'vessel',
      migrated: { events: expect.any(Number) },
    });
    const [p] = await t.db.select().from(projects).where(eq(projects.id, id));
    expect(p!.primaryApp).toBe('vessel');
    expect(p!.switchedAt).not.toBeNull();
    // The Vessel's records are the shop's as the old app left them: the recorded day's bills in.
    const bills = await new PgEntityStore(t.db, id).records('BILLS.DBF');
    expect(bills.filter((b) => !b.deleted).length).toBeGreaterThan(3);
    // Frozen: no more simulated days, no more twin events, no second switch.
    expect((await simulate(id)).json().error).toBe('SWITCHED');
    expect((await switchOver(id)).json().error).toBe('SWITCHED');
    const tok = (await app.inject({ method: 'POST', url: `/api/projects/${id}/twin/token` })).json()
      .token;
    const late = await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/twin/events`,
      headers: { authorization: `Bearer ${tok}` },
      payload: {
        seq: 999,
        occurredAt: '1998-07-30T10:00:00.000Z',
        files: [],
        diff: { tables: {}, unchanged: [], addedTables: [], removedTables: [] },
      },
    });
    expect(late.statusCode).toBe(409);
    expect(late.json().error).toBe('SWITCHED');
  });

  it('a bill a phone made in the reborn app before the switch-over does not block it: the old app’s records win', async () => {
    const id = await shifa();
    await simulate(id);
    await allMatched(id);
    // A phone tried the reborn app during shadow mode: its records are the old app's plus one
    // bill of its own (what a sync leaves in the project's records).
    const vessel = new PgEntityStore(t.db, id);
    const old = tablesFromBundle(
      graveyardBundle({ source: 'graveyard', sourceApp: 'shifa' })!,
      SHIFA_AS_IT_RUNS_SOUL,
    );
    for (const [f, tbl] of Object.entries(old)) await vessel.load(f, tbl.records);
    const bills = old['BILLS.DBF']!.records;
    const tryOut = { ...bills[0]!.values, BILL_NO: '9807-9999' };
    await vessel.load('BILLS.DBF', [...bills, { deleted: false, values: tryOut }]);
    const r = await switchOver(id);
    expect(r.json()).toMatchObject({ primaryApp: 'vessel' });
    const after = (await vessel.records('BILLS.DBF')).filter((b) => !b.deleted);
    // The old app's bills and the recorded day's, not the phone's try-out.
    const day1Bills = WEEK.events
      .filter((e) => e.day === WEEK.days[0])
      .filter((e) => (e as { files?: string[] }).files?.includes('BILLS.DBF')).length;
    expect(after.length).toBe(bills.length + day1Bills);
    expect(after.some((b) => b.values.BILL_NO === '9807-9999')).toBe(false);
  });

  it('an app with no recorded shop day cannot be simulated', async () => {
    const p = await store.create({ name: 'Iqra', source: 'graveyard', sourceApp: 'iqra' });
    expect((await overview(p.id)).simulate).toEqual({
      available: false,
      nextDay: null,
      recordedDays: 0,
    });
    expect((await simulate(p.id)).statusCode).toBe(404);
  });
});
