// @spec oracle-proof#1 Arbitraries from the Soul (Prompt 67).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DbfRecord } from '@afterlife/dbf';
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import {
  MemoryEntityStore,
  actionForm,
  createVessel,
  parseInput,
  tablesFromBundle,
} from '@afterlife/vessel';
import Decimal from 'decimal.js';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { caseArbitrary, prepareCases, thresholdsOf, type CaseContext } from './arbitraries';

const SOUL = SHIFA_REFERENCE_SOUL;
const TODAY = '1998-07-15';
const BUNDLE = new Uint8Array(
  readFileSync(resolve(__dirname, '../../../apps/web/public/graveyard/shifa.jsdos')),
);
const RECORDS: Record<string, DbfRecord[]> = Object.fromEntries(
  Object.entries(tablesFromBundle(BUNDLE, SOUL)).map(([f, t]) => [f, t.records]),
);
const RUNS = Math.min(Number(process.env.FC_NUM_RUNS ?? 100), 300);
let ctx: CaseContext;
beforeAll(async () => {
  ctx = await prepareCases(SOUL, RECORDS, { today: TODAY });
});
const vessel = async () => {
  const s = new MemoryEntityStore();
  for (const [f, r] of Object.entries(RECORDS)) await s.load(f, r);
  return createVessel(SOUL, s, { today: () => TODAY });
};
const keys = (file: string, field: string) =>
  new Set(RECORDS[file]!.filter((r) => !r.deleted).map((r) => String(r.values[field]).trim()));

describe('thresholdsOf', () => {
  it('Shifa’s rules compare the subtotal with 5000', () => {
    expect(thresholdsOf(SOUL)).toContainEqual({ ref: 'bill.subtotal', value: '5000' });
  });
});

describe('caseArbitrary', () => {
  // @spec oracle-proof#1.1
  it('every generated input passes the Soul’s field validation, and every link exists (invariant)', () => {
    const meds = keys('MEDICINE.DBF', 'CODE');
    const custs = keys('CUSTOMER.DBF', 'CUST_ID');
    fc.assert(
      fc.property(caseArbitrary(ctx), (c) => {
        const form = actionForm(SOUL, c.actionId);
        for (const f of form.header.inputs)
          expect(() => parseInput(f, c.inputs.values?.[f.name] ?? ''), f.name).not.toThrow();
        for (const l of c.inputs.lines ?? [])
          for (const f of form.line!.inputs)
            expect(() => parseInput(f, l[f.name] ?? ''), f.name).not.toThrow();
        if (c.actionId === 'save-bill') {
          const cust = c.inputs.values?.CUST_ID ?? '';
          expect(cust === '' || custs.has(cust)).toBe(true);
          for (const l of c.inputs.lines!) expect(meds.has(l.CODE!)).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('a case made up at the start is one the Vessel accepts: no refused line, within the stock', async () => {
    const v = await vessel();
    const stock = new Map(
      RECORDS['MEDICINE.DBF']!.map((r) => [String(r.values.CODE).trim(), Number(r.values.QTY)]),
    );
    await fc.assert(
      fc.asyncProperty(caseArbitrary(ctx), async (c) => {
        const r = await v.previewAction(c.actionId, c.inputs);
        expect(r.ok, JSON.stringify([c, r.ok ? null : r.refused])).toBe(true);
        for (const l of c.inputs.lines ?? [])
          expect(Number(l.QTY)).toBeLessThanOrEqual(stock.get(l.CODE!)!);
      }),
      { numRuns: RUNS },
    );
  });

  it('expired batches are left out of the lines (the Soul refuses them on their own)', () => {
    const codes = new Set(
      ctx.actions.find((a) => a.actionId === 'save-bill')!.lineRecords.map((r) => r.key),
    );
    // SEP200 expired on 30 June 1998, AMP500 on 1 July 1998; INS100 is good until 1999.
    expect(codes.has('SEP200')).toBe(false);
    expect(codes.has('AMP500')).toBe(false);
    expect(codes.has('INS100')).toBe(true);
  });

  // @spec oracle-proof#1.2
  it('threshold cases give one price step (5 paisa for Shifa) under, at and over Rs 5,000', async () => {
    const plans = ctx.actions.find((a) => a.actionId === 'save-bill')!.plans;
    const v = await vessel();
    const subtotals: string[] = [];
    for (const p of plans) {
      const r = await v.previewAction(p.actionId, p.inputs);
      expect(r.ok).toBe(true);
      if (r.ok) subtotals.push(new Decimal(String(r.record.SUBTOTAL)).toFixed(2));
    }
    expect(subtotals).toEqual(expect.arrayContaining(['4999.95', '5000.00', '5000.05']));
    // And they come up: a quarter of the bills are threshold bills.
    const sample = fc.sample(caseArbitrary(ctx, 'save-bill'), { numRuns: 200, seed: 7 });
    expect(sample.filter((c) => plans.includes(c)).length).toBeGreaterThan(20);
  });

  it('the records nearest to expiring come up more often than their share (date cutoffs)', () => {
    const a = ctx.actions.find((x) => x.actionId === 'save-bill')!;
    const nearKeys = new Set(a.lineRecords.filter((r) => r.near).map((r) => r.key));
    expect(nearKeys.size).toBeGreaterThan(0);
    const share = nearKeys.size / a.lineRecords.length;
    const lines = fc
      .sample(caseArbitrary(ctx, 'save-bill'), { numRuns: 400, seed: 11 })
      .flatMap((c) => c.inputs.lines ?? []);
    const seen = lines.filter((l) => nearKeys.has(l.CODE!)).length / lines.length;
    expect(seen).toBeGreaterThan(share);
  });

  it('the same seed gives the same cases (repeatable)', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const a = fc.sample(caseArbitrary(ctx), { numRuns: 5, seed });
        const b = fc.sample(caseArbitrary(ctx), { numRuns: 5, seed });
        expect(a).toEqual(b);
      }),
      { numRuns: 20 },
    );
  });
});
