// @spec archaeologist-completion#1.3 The archaeology step stores the actions.
// Prompt 53: after possession, the worker writes the detected entities into a Soul version.
// The real Shifa bundle's data files, and observations of a bill and a customer saved on them.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FakeLlmClient, fakeToolUse, type LlmRequest } from '@afterlife/crew';
import { diffSnapshots, readDbf, snapshot, writeDbf } from '@afterlife/dbf';
import { llmCalls, observations, projects, souls, eq } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { SoulSchema } from '@afterlife/soul';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SHIFA_REFERENCE_SOUL } from '../../../packages/soul/src/examples/shifa';
import { NO_RULE_MODEL, bundleTables, entitiesStep } from './entities-step';
import { graveyardBundle } from './possess';
import type { StepContext } from './registry';

const DIST = resolve(__dirname, '../../../samples/graveyard/dist/shifa');
const FILES = ['MEDICINE.DBF', 'CUSTOMER.DBF', 'BILLS.DBF', 'BILLITEM.DBF'];
const bundle = graveyardBundle({ source: 'graveyard', sourceApp: 'shifa' })!;

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
});
afterAll(async () => {
  await t.drop();
});

const screen = (title: string, fp: string) => ({
  fingerprint: fp,
  text: [],
  model: { title: { name: title }, fields: [], menu: null },
  cursor: null,
});

/** A bill and a new customer; with `second`, another bill of two medicines after them. */
async function saves(second = false) {
  const before = Object.fromEntries(
    FILES.map((f) => [f, new Uint8Array(readFileSync(resolve(DIST, f)))]),
  );
  const plus = (file: string, ...rows: Record<string, string>[]) => {
    const d = readDbf(before[file]!);
    return writeDbf({
      fields: d.fields,
      records: [...d.records, ...rows.map((values) => ({ deleted: false, values }))],
      lastUpdate: { year: 1998, month: 7, day: 15 },
    });
  };
  const bill = {
    ...before,
    'BILLS.DBF': plus('BILLS.DBF', {
      BILL_NO: '9807-0001',
      BILL_DATE: '19980715',
      CUST_ID: '',
      SUBTOTAL: '25.00',
      DISCOUNT: '0.00',
      GST: '4.25',
      TOTAL: '29.25',
    }),
    'BILLITEM.DBF': plus('BILLITEM.DBF', {
      BILL_NO: '9807-0001',
      LINE: '1',
      CODE: 'PAN500',
      QTY: '2',
      PRICE: '12.50',
      AMOUNT: '25.00',
    }),
  };
  const cust = {
    ...before,
    'CUSTOMER.DBF': plus('CUSTOMER.DBF', {
      CUST_ID: 'C0009',
      NAME: 'ALI RAZA',
      PHONE: '051-4567890',
    }),
  };
  const bill2 = {
    ...before,
    'BILLS.DBF': plus('BILLS.DBF', {
      BILL_NO: '9807-0002',
      BILL_DATE: '19980715',
      CUST_ID: '',
      SUBTOTAL: '47.30',
      DISCOUNT: '0.00',
      GST: '8.04',
      TOTAL: '55.34',
    }),
    'BILLITEM.DBF': plus(
      'BILLITEM.DBF',
      {
        BILL_NO: '9807-0002',
        LINE: '1',
        CODE: 'PAN500',
        QTY: '3',
        PRICE: '12.50',
        AMOUNT: '37.50',
      },
      { BILL_NO: '9807-0002', LINE: '2', CODE: 'FLA400', QTY: '1', PRICE: '9.80', AMOUNT: '9.80' },
    ),
  };
  return [
    { keys: '{F2}', diff: diffSnapshots(await snapshot(before), await snapshot(bill)) },
    {
      keys: '0514567890{Enter}',
      diff: diffSnapshots(await snapshot(before), await snapshot(cust)),
    },
    ...(second
      ? [{ keys: '{F2}', diff: diffSnapshots(await snapshot(before), await snapshot(bill2)) }]
      : []),
  ];
}

function ctx(projectId: string) {
  const events: [string, unknown][] = [];
  const c: StepContext = {
    projectId,
    project: { name: 'Shifa', source: 'graveyard', sourceApp: 'shifa', dosTime: null },
    step: 'archaeology',
    attempt: 1,
    force: false,
    signal: new AbortController().signal,
    emit: async (type, payload) => void events.push([type, payload]),
    log: async (message) => void events.push(['log', { message }]),
  };
  return { c, events };
}

async function shifaProject(second = false) {
  const [p] = await t.db
    .insert(projects)
    .values({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' })
    .returning();
  let seq = 0;
  for (const s of await saves(second))
    await t.db.insert(observations).values({
      projectId: p!.id,
      seq: seq++,
      keys: s.keys,
      screenBeforeFp: 'fp_1ea84e74e2cd7cec',
      screenAfterFp: 'fp_1ea84e74e2cd7cec',
      screenBefore: screen('NEW BILL', 'fp_1ea84e74e2cd7cec'),
      screenAfter: screen('NEW BILL', 'fp_1ea84e74e2cd7cec'),
      dbfDiff: s.diff,
      durationMs: 10,
      stable: true,
    });
  return p!;
}

describe('bundleTables', () => {
  it("reads the data files out of an app's js-dos bundle", () => {
    expect(
      bundleTables(bundle)
        .map((x) => x.file)
        .sort(),
    ).toEqual([...FILES].sort());
  });
});

describe('the entities step (Prompt 53)', () => {
  it('stores a Soul with the entities found, the same as the reference Soul', async () => {
    const [p] = await t.db
      .insert(projects)
      .values({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' })
      .returning();
    let seq = 0;
    for (const s of await saves())
      await t.db.insert(observations).values({
        projectId: p!.id,
        seq: seq++,
        keys: s.keys,
        screenBeforeFp: 'fp_1ea84e74e2cd7cec',
        screenAfterFp: 'fp_1ea84e74e2cd7cec',
        screenBefore: screen('NEW BILL', 'fp_1ea84e74e2cd7cec'),
        screenAfter: screen('NEW BILL', 'fp_1ea84e74e2cd7cec'),
        dbfDiff: s.diff,
        durationMs: 10,
        stable: true,
      });
    const { c, events } = ctx(p!.id);
    const r = await entitiesStep({
      db: t.db,
      bundleFor: () => bundle,
      now: () => new Date('1998-07-15T10:00:00Z'),
    })(c);
    expect(r).toMatchObject({
      status: 'done',
      output: { version: 1, entities: 4, keys: 4, foreignKeys: 3, counters: 2 },
    });
    const [row] = await t.db.select().from(souls).where(eq(souls.projectId, p!.id));
    const soul = SoulSchema.parse(row!.ir);
    expect(soul.provenance).toMatchObject({ createdBy: 'archaeologist', observationCount: 2 });
    // With no model and one bill (25.00 = 2 x 12.50), only the date is told apart: many short
    // expressions give each amount, so none is kept until another bill (review 51-60).
    expect(soul.rules.map((x) => [x.target, x.expression])).toEqual([['bill.bill_date', 'today']]);
    // The actions the observations show: the bill saved and the customer added.
    expect(soul.actions.map((x) => [x.id, x.effects.map((e) => `${e.kind} ${e.entity}`)])).toEqual([
      ['save-bill', ['insert bill', 'insert bill-item']],
      ['add-customer', ['insert customer']],
    ]);
    expect(r).toMatchObject({ output: { actions: 2 } });
    for (const ref of SHIFA_REFERENCE_SOUL.entities) {
      const got = soul.entities.find((e) => e.id === ref.id)!;
      expect(
        { key: got.key, foreignKeys: got.foreignKeys, counters: got.counters },
        ref.id,
      ).toEqual({
        key: ref.key,
        foreignKeys: ref.foreignKeys,
        counters: ref.counters,
      });
    }
    expect(events.find(([type]) => type === 'soul_updated')?.[1]).toMatchObject({
      version: 1,
      reason: 'rules',
    });
    const logs = events
      .filter(([x]) => x === 'log')
      .map(([, m]) => (m as { message: string }).message);
    expect(logs).toContain(
      'BILLS.DBF: key BILL_NO, counter BILL_NO YYMM-####, CUST_ID refers to customer',
    );
  });

  it('without a model it finds the rules among short expressions, and says so', async () => {
    const p = await shifaProject(true);
    const { c, events } = ctx(p.id);
    const r = await entitiesStep({ db: t.db, bundleFor: () => bundle, llm: null })(c);
    expect(r).toMatchObject({ status: 'done', output: { probed: 0 } });
    expect(events).toContainEqual(['log', { message: NO_RULE_MODEL }]);
    const [row] = await t.db.select().from(souls).where(eq(souls.projectId, p.id));
    const rule = (x: string) =>
      SoulSchema.parse(row!.ir).rules.find((y) => y.target === x)?.expression;
    // Two bills under 5,000: the rules they show.
    expect(rule('bill.bill_date')).toBe('today');
    expect(rule('bill.discount')).toBe('0');
    expect(rule('bill.gst')).toBe('trunc(bill.subtotal * 0.17, 2)');
    expect(rule('bill.subtotal')).toBe('sum(items, x => x.amount)');
    expect(rule('bill_item.price')).toBe('medicine.price');
    expect(rule('bill_item.amount')).toBe('bill_item.qty * bill_item.price');
    const found = events.filter(([x]) => x === 'rule_found');
    expect(found.length).toBe((r as { output: { rules: number } }).output.rules);
  });

  it('with a model, each value gets candidates, and only a rule that explains every observation is kept (Prompt 55)', async () => {
    const p = await shifaProject(true);
    // The model's candidates per value; for the others it proposes rules that do not fit.
    const proposals: Record<string, string[]> = {
      'bill.gst': [
        'round(bill.subtotal * 0.18, 2)',
        'trunc(bill.subtotal * 0.17, 2)',
        'trunc(bill.subtotal * 0.16, 2)',
      ],
      'bill.discount': ['trunc(bill.subtotal * 0.10, 2)', '0', 'bill.subtotal'],
    };
    const client = new FakeLlmClient((req: LlmRequest) => {
      const text = JSON.stringify(req.messages[0]!.content);
      const target = /Effect: ([a-z_]+\.[a-z_]+)/.exec(text)![1]!;
      const exprs = proposals[target] ?? ['1', '2', '3'];
      return fakeToolUse('answer', {
        candidates: exprs.map((expression) => ({ expression, why: `${target} rule` })),
      });
    });
    const { c, events } = ctx(p.id);
    const r = await entitiesStep({ db: t.db, bundleFor: () => bundle, llm: client })(c);
    expect(r).toMatchObject({ status: 'done' });
    const [row] = await t.db.select().from(souls).where(eq(souls.projectId, p.id));
    const soul = SoulSchema.parse(row!.ir);
    const [obs, , obs2] = await t.db
      .select({ id: observations.id })
      .from(observations)
      .where(eq(observations.projectId, p.id))
      .orderBy(observations.seq);
    const gst = soul.rules.find((x) => x.target === 'bill.gst')!;
    // The model's candidate fits; its reason is the rule's English.
    expect(gst.expression).toBe('trunc(bill.subtotal * 0.17, 2)');
    expect(gst).toMatchObject({ id: 'bill-gst', kind: 'compute', en: 'bill.gst rule', ur: '' });
    expect(gst.evidence).toEqual([obs!.id, obs2!.id]);
    expect(gst.confidence).toBeGreaterThan(0);
    // One rule_found event per rule kept, and every model call logged for "Show your work".
    expect(
      events.filter(([x]) => x === 'rule_found').map(([, e]) => (e as { target: string }).target),
    ).toEqual(soul.rules.map((x) => x.target));
    const calls = await t.db.select().from(llmCalls).where(eq(llmCalls.projectId, p.id));
    expect(calls.length).toBe(client.requests.length);
    expect(calls.every((x) => x.agent === 'archaeologist')).toBe(true);
  });

  it('a project with no bundle is skipped and says why', async () => {
    const [p] = await t.db
      .insert(projects)
      .values({ name: 'X', source: 'upload', sourceApp: 'x.zip' })
      .returning();
    const { c } = ctx(p!.id);
    c.project = { name: 'X', source: 'upload', sourceApp: 'x.zip', dosTime: null };
    const r = await entitiesStep({ db: t.db, bundleFor: () => null })(c);
    expect(r).toEqual({ status: 'skipped', reason: 'There is no js-dos bundle for x.zip yet' });
  });
});
