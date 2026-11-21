// Prompt 60: phones sync their sales. Each phone is the Vessel on the old app's own data files (the
// real Shifa bundle), offline; the server replays the sales on its records in Postgres.
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import {
  MemoryEntityStore,
  MemoryOutbox,
  createVessel,
  queuedVessel,
  seedStore,
  type SyncItem,
} from '@afterlife/vessel';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { parseEnv } from './env';
import { PgProjectStore } from './projects-pg';
import { PgSoulStore } from './souls';
import { PgVesselStore, graveyardBundle } from './vessel';

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
      vessel: new PgVesselStore(t.db, (id) => projects.get(id)),
    },
  );
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

const bundle = graveyardBundle({ source: 'graveyard', sourceApp: 'shifa' })!;
let n = 0;
const newId = () => `0190a0b0-0000-7000-8000-${String(++n).padStart(12, '0')}`;

async function phone() {
  const store = new MemoryEntityStore();
  await seedStore(store, bundle, SHIFA_REFERENCE_SOUL);
  const outbox = new MemoryOutbox();
  const today = () => '1998-07-15';
  const v = queuedVessel(createVessel(SHIFA_REFERENCE_SOUL, store, { today }), outbox, {
    today,
    newId,
  });
  return { store, outbox, v };
}

async function shifa(withSoul = true) {
  const p = await projects.create({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' });
  if (withSoul) await new PgSoulStore(t.db).add(p.id, SHIFA_REFERENCE_SOUL);
  return p.id;
}
const sync = (id: string, items: SyncItem[]) =>
  app.inject({ method: 'POST', url: `/api/projects/${id}/vessel/sync`, payload: { items } });
const insulin = (qty: string) => ({ lines: [{ CODE: 'INS100', QTY: qty }] });
const stock = async (id: string, code: string) =>
  (await app.inject(`/api/projects/${id}/vessel/records`))
    .json()
    .files['MEDICINE.DBF'].find((r: { values: { CODE: string } }) => r.values.CODE === code).values
    .QTY;

describe('POST /api/projects/:id/vessel/sync', () => {
  it('three bills made offline: the server has them, the same as the phone; sending again changes nothing', async () => {
    const id = await shifa();
    const p = await phone();
    for (const q of ['1', '2', '3']) await p.v.performAction('save-bill', insulin(q));
    const items = await p.outbox.pending();
    const res = await sync(id, items);
    expect(res.statusCode).toBe(200);
    expect(res.json().results.map((r: { ok: boolean }) => r.ok)).toEqual([true, true, true]);
    const files = (await app.inject(`/api/projects/${id}/vessel/records`)).json().files;
    for (const f of ['BILLS.DBF', 'BILLITEM.DBF', 'MEDICINE.DBF', 'CUSTOMER.DBF'])
      expect(files[f], f).toEqual(await p.store.records(f));
    expect(
      files['BILLS.DBF'].slice(-3).map((b: { values: { BILL_NO: string } }) => b.values.BILL_NO),
    ).toEqual(['9807-0001', '9807-0002', '9807-0003']);
    // The answer was lost and the phone sends them again: applied once.
    const again = await sync(id, items);
    expect(again.json()).toEqual(res.json());
    expect(await stock(id, 'INS100')).toBe('6');
  });

  it('the same bill sent twice at once (a retry while the first is on its way) is applied once', async () => {
    const id = await shifa();
    const p = await phone();
    await p.v.performAction('save-bill', insulin('2'));
    const items = await p.outbox.pending();
    const [a, b] = await Promise.all([sync(id, items), sync(id, items)]);
    expect(a.json()).toEqual(b.json());
    const bills = (await app.inject(`/api/projects/${id}/vessel/records`))
      .json()
      .files['BILLS.DBF'].filter((r: { values: { BILL_NO: string } }) =>
        r.values.BILL_NO.startsWith('9807-'),
      );
    expect(bills).toHaveLength(1);
    expect(await stock(id, 'INS100')).toBe('10');
  });

  it('two phones come online at once for the first sync: both sales stand, none is lost', async () => {
    const id = await shifa();
    const a = await phone();
    const b = await phone();
    await a.v.performAction('save-bill', insulin('2'));
    await b.v.performAction('save-bill', insulin('3'));
    const [ra, rb] = await Promise.all([
      sync(id, await a.outbox.pending()),
      sync(id, await b.outbox.pending()),
    ]);
    expect([ra.json().results[0].ok, rb.json().results[0].ok]).toEqual([true, true]);
    expect(await stock(id, 'INS100')).toBe('7');
  });

  it('two phones sold the same insulin: both sales stand, and the second is on the review list until reviewed', async () => {
    const id = await shifa();
    const a = await phone();
    const b = await phone();
    await a.v.performAction('save-bill', insulin('2'));
    await b.v.performAction('save-bill', insulin('3'));
    await sync(id, await a.outbox.pending());
    const r = (await sync(id, await b.outbox.pending())).json().results[0];
    expect(r).toMatchObject({ ok: true, renumbered: { phone: '9807-0001', server: '9807-0002' } });
    expect(await stock(id, 'INS100')).toBe('7');
    const list = (await app.inject(`/api/projects/${id}/vessel/conflicts`)).json().conflicts;
    expect(list).toEqual([
      {
        id: r.id,
        at: expect.any(String),
        record: '9807-0002',
        conflicts: [
          {
            file: 'MEDICINE.DBF',
            key: 'INS100',
            field: 'QTY',
            phone: { before: '12', after: '9' },
            server: { before: '10', after: '7' },
          },
        ],
      },
    ]);
    const done = await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/vessel/conflicts/${r.id}/review`,
    });
    expect(done.json()).toEqual({ reviewed: true });
    expect((await app.inject(`/api/projects/${id}/vessel/conflicts`)).json().conflicts).toEqual([]);
  });

  it('says why it cannot: no Soul, an upload with no records yet, a bad body, a bad id', async () => {
    expect((await sync(await shifa(false), [])).json()).toMatchObject({ error: 'NO_SOUL' });
    const up = await projects.create({ name: 'X', source: 'upload', sourceApp: 'x.zip' });
    await new PgSoulStore(t.db).add(up.id, SHIFA_REFERENCE_SOUL);
    const r = await sync(up.id, []);
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe('NO_DATA');
    const id = await shifa();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/projects/${id}/vessel/sync`,
          payload: { items: [{ id: 'x' }] },
        })
      ).statusCode,
    ).toBe(400);
    expect((await app.inject('/api/projects/nope/vessel/records')).statusCode).toBe(400);
    expect((await app.inject(`/api/projects/${id}/vessel/records`)).statusCode).toBe(404);
  });
});
