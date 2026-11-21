// @spec archaeologist-completion#3.2 The Possessor typing the Archaeologist's probes (review of
// 51-60, finding 3), with a fake old app: which bills it types, what it stores, when it stops.
import type { RuleProbe } from '@afterlife/crew';
import type { SnapshotDiff } from '@afterlife/dbf';
import { observations, projects, eq } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import type { Observation } from '@afterlife/emulator';
import type { Soul } from '@afterlife/soul';
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import type { ActionInputs } from '@afterlife/vessel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readCsv } from '../../../packages/crew/src/archaeologist/testing/graveyard-runs';
import { MAX_PROBE_BILLS, probeRunner } from './probe-runner';

const { rules, ...DRAFT } = SHIFA_REFERENCE_SOUL;
const TABLES = Object.fromEntries(
  ['MEDICINE', 'CUSTOMER', 'BILLS', 'BILLITEM'].map((f) => [
    `${f}.DBF`,
    readCsv(`shifa/seed/${f}.csv`).records,
  ]),
);
const NONE: SnapshotDiff = { tables: {}, unchanged: [], addedTables: [], removedTables: [] };
const SAVED: SnapshotDiff = {
  ...NONE,
  tables: {
    'BILLS.DBF': {
      key: 'BILL_NO',
      inserted: [{ key: '9807-0099', recno: 99, values: { BILL_NO: '9807-0099' } }],
      deleted: [],
      updated: [],
      schema: { added: [], removed: [] },
    },
  },
};
const screen = (fingerprint: string) =>
  ({ fingerprint, text: [] }) as unknown as Observation['screenBefore'];
const step = (keys: string, dbfDiff: SnapshotDiff): Observation => ({
  keys,
  screenBefore: screen('fp_bill'),
  screenAfter: screen('fp_bill'),
  dbfDiff,
  durationMs: 10,
  stable: true,
});
const probe = (field: string, values: string[]): RuleProbe => ({
  target: 'bill.discount',
  field,
  values,
  text: `Try a ${field} of ${values.join(', ')}`,
});

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
});
afterAll(async () => {
  await t.drop();
});

/** A runner on a fake old app that refuses any bill `refuse` says no to. */
async function runner(refuse: (inputs: ActionInputs) => boolean = () => false) {
  const [p] = await t.db
    .insert(projects)
    .values({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' })
    .returning();
  const typed: ActionInputs[] = [];
  const logs: [string, string | undefined][] = [];
  let seq = 100;
  const run = probeRunner({
    db: t.db,
    pool: { use: () => Promise.reject(new Error('the fake types the bills')) },
    projectId: p!.id,
    bundle: new Uint8Array([1]),
    dosTime: '1998-07-15T10:00:00',
    tables: TABLES,
    graph: { nodes: [], edges: [] } as never,
    draft: DRAFT as Omit<Soul, 'rules'>,
    nextSeq: () => seq++,
    log: async (m, level) => void logs.push([m, level]),
    type: async (_action, inputs) => {
      typed.push(inputs);
      return [step('C0001{Enter}', NONE), step('{F2}', refuse(inputs) ? NONE : SAVED)];
    },
  });
  return { run, typed, logs, projectId: p!.id };
}

describe('probeRunner', () => {
  it('types each planned bill once, stores every step, and gives the steps that saved', async () => {
    const { run, typed, projectId } = await runner();
    // A GST of 2.12 is the bill of 12.50 (one PAN500): it is not typed a second time.
    const out = await run([probe('bill.subtotal', ['12.5']), probe('bill.gst', ['2.12'])], rules);
    expect(typed).toEqual([{ lines: [{ CODE: 'PAN500', QTY: '1' }] }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.keys).toBe('{F2}');
    const rows = await t.db
      .select()
      .from(observations)
      .where(eq(observations.projectId, projectId))
      .orderBy(observations.seq);
    expect(rows.map((r) => [r.seq, r.keys, r.hint])).toEqual([
      [100, 'C0001{Enter}', { text: 'probe: bill.subtotal = 12.5', from: 'probe' }],
      [101, '{F2}', { text: 'probe: bill.subtotal = 12.5', from: 'probe' }],
    ]);
    expect(out[0]!.id).toBe(rows[1]!.id);
  });

  it('a bill saved in an earlier round is not typed again', async () => {
    const { run, typed } = await runner();
    await run([probe('bill.subtotal', ['12.5'])], rules);
    expect(await run([probe('bill.gst', ['2.12'])], rules)).toEqual([]);
    expect(typed).toHaveLength(1);
  });

  it('a bill the old app refuses is logged, and the next plan for the value is typed', async () => {
    const { run, typed, logs } = await runner((i) => i.lines![0]!.CODE === 'PAN500');
    const out = await run([probe('bill.subtotal', ['1000'])], rules);
    expect(typed.length).toBe(2);
    expect(typed[0]!.lines![0]!.CODE).toBe('PAN500');
    expect(typed[1]!.lines![0]!.CODE).not.toBe('PAN500');
    expect(out).toHaveLength(1);
    expect(logs).toContainEqual([
      'Probe bill.subtotal = 1000: the old app did not save PAN500 x 80',
      'warn',
    ]);
  });

  it(`types no more than ${MAX_PROBE_BILLS} bills a round`, async () => {
    const { run, typed } = await runner(() => true);
    const values = ['1000', '2000', '3000', '4000', '5000', '6000'];
    await run([probe('bill.subtotal', values)], rules);
    expect(typed).toHaveLength(MAX_PROBE_BILLS);
  });
});
