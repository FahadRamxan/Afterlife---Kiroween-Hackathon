// @spec archaeologist-completion#3 Probes in the old app.
// @spec archaeologist-completion#3.1 The probe planner and its property.
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import { MemoryEntityStore, createVessel } from '@afterlife/vessel';
import Decimal from 'decimal.js';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { MAX_PLAN_LINES, planProbe, probePlanner } from './probes';
import { readCsv } from './testing/graveyard-runs';

const SOUL = SHIFA_REFERENCE_SOUL;
const TODAY = '1998-07-15';
let store: MemoryEntityStore;
beforeAll(async () => {
  store = new MemoryEntityStore();
  for (const f of ['MEDICINE', 'CUSTOMER', 'BILLS', 'BILLITEM'])
    await store.load(`${f}.DBF`, readCsv(`shifa/seed/${f}.csv`).records);
});
const probe = (values: string[]) => ({
  target: 'bill.discount',
  field: 'bill.subtotal',
  values,
  text: 'Try a bill subtotal of …',
});

describe('planProbe on Shifa', () => {
  it('plans bills of exactly 5000, 5001 and 10000 from the shop’s own medicines', async () => {
    const plans = await planProbe(probe(['5000', '5001', '10000']), SOUL, store, TODAY);
    expect(plans.map((p) => p.value)).toEqual(['5000', '5001', '10000']);
    const v = createVessel(SOUL, store, { today: () => TODAY });
    for (const p of plans) {
      expect(p.actionId).toBe('save-bill');
      expect(p.inputs.length).toBeGreaterThan(0);
      for (const inputs of p.inputs) {
        const r = await v.previewAction('save-bill', inputs);
        expect(r.ok && r.record.SUBTOTAL, `${p.value} ${JSON.stringify(inputs)}`).toBe(
          new Decimal(p.value).toFixed(2),
        );
      }
    }
  });

  it('prefers one medicine, then the fewest of it, and leaves expired batches to the last', async () => {
    const [p] = await planProbe(probe(['650']), SOUL, store, TODAY);
    // 650.00: one insulin (INS100 at 650.00; its batch expired in January 1999, after today).
    expect(p!.inputs[0]).toEqual({ lines: [{ CODE: 'INS100', QTY: '1' }] });
    const [q] = await planProbe(probe(['14']), SOUL, store, TODAY);
    // SEP200 (14.00) expired on 30 June 1998: the plans use other medicines first.
    expect(q!.inputs[0]!.lines!.some((l) => l.CODE === 'SEP200')).toBe(false);
  });

  it('plans before the stock rule is found (the bill does not need it)', async () => {
    const soul = { ...SOUL, rules: SOUL.rules.filter((r) => r.target !== 'medicine.qty') };
    const [p] = await planProbe(probe(['1000']), soul, store, TODAY);
    expect(p!.inputs[0]).toEqual({ lines: [{ CODE: 'PAN500', QTY: '80' }] });
  });

  it('nothing to plan for a value no action writes, or one the lines cannot make', async () => {
    expect(await planProbe({ ...probe(['5']), field: 'medicine.qty' }, SOUL, store, TODAY)).toEqual(
      [],
    );
    expect(await planProbe(probe(['0.01']), SOUL, store, TODAY)).toEqual([]);
  });

  it('never asks for more of a medicine than the shop has, using up to three lines', async () => {
    // 10000 needs more than any one or two medicines in stock give exactly (PAN500 x800 does
    // not exist: 240 strips).
    const [p] = await planProbe(probe(['10000']), SOUL, store, TODAY);
    expect(p!.inputs.length).toBeGreaterThan(0);
    for (const inputs of p!.inputs) {
      expect(inputs.lines!.length).toBeLessThanOrEqual(MAX_PLAN_LINES);
      expect(new Set(inputs.lines!.map((l) => l.CODE)).size).toBe(inputs.lines!.length);
    }
  });

  it('every line is within the medicine’s stock (invariant)', async () => {
    const stock = new Map(
      (await store.records('MEDICINE.DBF')).map((r) => [
        String(r.values.CODE).trim(),
        Number(r.values.QTY),
      ]),
    );
    const plan = await probePlanner(SOUL, store, TODAY);
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 10, max: 20_000 }), async (rupees) => {
        for (const p of await plan(probe([String(rupees)])))
          for (const inputs of p.inputs)
            for (const l of inputs.lines!)
              expect(Number(l.QTY)).toBeLessThanOrEqual(stock.get(l.CODE!)!);
      }),
    );
  });

  it('every plan gives exactly the total asked for (invariant)', async () => {
    const plan = await probePlanner(SOUL, store, TODAY);
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 10, max: 20_000 }), async (rupees) => {
        const v = createVessel(SOUL, store, { today: () => TODAY });
        for (const p of await plan(probe([String(rupees)])))
          for (const inputs of p.inputs) {
            const r = await v.previewAction('save-bill', inputs);
            expect(r.ok && new Decimal(String(r.record.SUBTOTAL)).eq(rupees)).toBe(true);
          }
      }),
    );
  });
});
