// @spec undertaker#2 The undertake step.
// @spec undertaker#2.1 The undertake step: the old app's data into the Vessel's records (Prompt 64).
import type { DbfRecord } from '@afterlife/dbf';
import { insertSoulVersion, projects, vesselSync } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { numberSoul, specRequirements, type Soul } from '@afterlife/soul';
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import { tablesFromBundle } from '@afterlife/vessel';
import { PgEntityStore } from '@afterlife/vessel/postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { graveyardBundle } from './possess';
import type { StepContext } from './registry';
import { undertakeStep } from './undertake-step';

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
});
afterAll(async () => {
  await t.drop();
});
const bundle = graveyardBundle({ source: 'graveyard', sourceApp: 'shifa' })!;

async function project(soul: Soul | null, source: 'graveyard' | 'upload' = 'graveyard') {
  const [p] = await t.db
    .insert(projects)
    .values({ name: 'Shifa', source, sourceApp: source === 'graveyard' ? 'shifa' : 'x.zip' })
    .returning();
  if (soul)
    await insertSoulVersion(t.db, p!.id, (v, parent) => {
      const s = numberSoul(soul, p!.id, v, parent);
      return { ir: s, specMarkdown: specRequirements(s) };
    });
  return p!;
}
function ctx(p: { id: string; source: string; sourceApp: string }) {
  const logs: string[] = [];
  const events: [string, unknown][] = [];
  const c: StepContext = {
    projectId: p.id,
    project: {
      name: 'Shifa',
      source: p.source as 'graveyard',
      sourceApp: p.sourceApp,
      dosTime: null,
    },
    step: 'undertake',
    attempt: 1,
    force: false,
    signal: new AbortController().signal,
    emit: async (type, payload) => void events.push([type, payload]),
    log: async (m) => void logs.push(m),
  };
  return { c, logs, events };
}
const step = (c: StepContext, b: Uint8Array | null = bundle) =>
  undertakeStep({ db: t.db, bundleFor: async (p) => (p.source === 'graveyard' ? b : null) })(c);

describe('the undertake step', () => {
  it('migrates every file of the Soul into the Vessel’s records, unchanged, and reports it', async () => {
    const p = await project(SHIFA_REFERENCE_SOUL);
    const { c, logs } = ctx(p);
    const r = await step(c);
    expect(r).toMatchObject({
      status: 'done',
      output: {
        written: true,
        rejected: [],
        tables: [
          {
            file: 'MEDICINE.DBF',
            entity: 'medicine',
            read: 40,
            deleted: 0,
            migrated: 40,
            rejected: 0,
          },
          { file: 'CUSTOMER.DBF', entity: 'customer', migrated: 8, rejected: 0 },
          { file: 'BILLS.DBF', entity: 'bill', rejected: 0 },
          { file: 'BILLITEM.DBF', entity: 'bill-item', rejected: 0 },
        ],
      },
    });
    const store = new PgEntityStore(t.db, p.id);
    const old = tablesFromBundle(bundle, SHIFA_REFERENCE_SOUL);
    for (const [file, table] of Object.entries(old))
      expect(
        (await store.records(file)).map((x) => x.values),
        file,
      ).toEqual(table.records.filter((x) => !x.deleted).map((x) => x.values));
    expect(logs).toContain('MEDICINE.DBF: 40 records crossed, none rejected');
  });

  it('reconciles what it wrote against the old data: all green, and a progress event per table', async () => {
    // @spec undertaker#3.2 Prompt 65: the reconciliation of the real step, read back from Postgres.
    const p = await project(SHIFA_REFERENCE_SOUL);
    const { c, events, logs } = ctx(p);
    const r = (await step(c)) as {
      status: string;
      output: {
        reconciliation: {
          matches: boolean;
          lines: { table: string; total: string; ok: boolean }[];
        };
      };
    };
    expect(r.status).toBe('done');
    expect(r.output.reconciliation.matches).toBe(true);
    expect(r.output.reconciliation.lines.map((l) => `${l.table} ${l.total}`)).toContain(
      'all stock value',
    );
    expect(r.output.reconciliation.lines.every((l) => l.ok)).toBe(true);
    expect(logs.at(-1)).toMatch(/^Reconciled: \d+ totals match exactly$/);
    // @spec undertaker#4.1 One event per table, for the data crossing panel (Prompt 66).
    expect(events.filter(([t]) => t === 'migration').map(([, e]) => e)).toEqual([
      { file: 'MEDICINE.DBF', entity: 'medicine', crossed: 40, rejected: 0, of: 40 },
      { file: 'CUSTOMER.DBF', entity: 'customer', crossed: 8, rejected: 0, of: 8 },
      expect.objectContaining({ file: 'BILLS.DBF', rejected: 0 }),
      expect.objectContaining({ file: 'BILLITEM.DBF', rejected: 0 }),
    ]);
  });

  it('a migration that does not reconcile fails the step, naming what differs', async () => {
    const p = await project(SHIFA_REFERENCE_SOUL);
    // A broken Vessel store that loses the first record of each file it is given.
    const lossy = (id: string) => {
      const s = new PgEntityStore(t.db, id);
      return Object.assign(Object.create(s) as PgEntityStore, {
        load: (file: string, records: DbfRecord[]) => s.load(file, records.slice(1)),
      });
    };
    const r = await undertakeStep({ db: t.db, bundleFor: async () => bundle, storeFor: lossy })(
      ctx(p).c,
    );
    expect(r.status).toBe('failed');
    expect((r as { reason: string }).reason).toMatch(
      /^The migration does not reconcile: MEDICINE\.DBF records 40 → 39/,
    );
  });

  it('never writes over records phones have synced sales into', async () => {
    const p = await project(SHIFA_REFERENCE_SOUL);
    await step(ctx(p).c);
    const store = new PgEntityStore(t.db, p.id);
    const sold = (await store.records('MEDICINE.DBF')).map((r, i) =>
      i === 0 ? { ...r, values: { ...r.values, QTY: '1' } } : r,
    );
    await store.load('MEDICINE.DBF', sold);
    await t.db.insert(vesselSync).values({
      id: '0190a0b0-0000-7000-8000-00000000abcd',
      projectId: p.id,
      actionId: 'save-bill',
      item: {},
      result: { ok: true },
    });
    const { c, logs } = ctx(p);
    const r = await step(c);
    expect(r).toMatchObject({ status: 'done', output: { written: false } });
    expect((await store.records('MEDICINE.DBF'))[0]!.values.QTY).toBe('1');
    expect(logs).toContain(
      'Phones have synced sales into this project’s records, so the migration was checked, not written over them',
    );
  });

  it('a record that cannot be converted is rejected with its reason and fix, the rest cross', async () => {
    const p = await project(SHIFA_REFERENCE_SOUL);
    const tables = tablesFromBundle(bundle, SHIFA_REFERENCE_SOUL);
    const bad = tables['MEDICINE.DBF']!.records[1]!;
    bad.values.EXPIRY = '19990231';
    const r = await undertakeStep({
      db: t.db,
      bundleFor: async () => bundle,
      tablesFor: () => tables,
    })(ctx(p).c);
    expect(r).toMatchObject({
      status: 'done',
      output: {
        rejected: [
          {
            file: 'MEDICINE.DBF',
            recno: 2,
            field: 'EXPIRY',
            reason: 'EXPIRY is "19990231", which is not a day of the calendar',
            fix: 'Correct the date in EXPIRY, or blank it',
          },
        ],
      },
    });
    expect(await new PgEntityStore(t.db, p.id).records('MEDICINE.DBF')).toHaveLength(39);
  });

  it('no Soul, or no data files: skipped, with the reason', async () => {
    expect(await step(ctx(await project(null)).c)).toEqual({
      status: 'skipped',
      reason: 'This project has no Soul yet',
    });
    expect(await step(ctx(await project(SHIFA_REFERENCE_SOUL, 'upload')).c)).toEqual({
      status: 'skipped',
      reason: 'There are no data files for this project yet',
    });
  });
});
