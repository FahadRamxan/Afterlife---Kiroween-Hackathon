// @spec oracle-proof#3 Shrinking and the counterexample (Prompt 69), with a Vessel standing in for
// the old app.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DbfRecord } from '@afterlife/dbf';
import type { Soul } from '@afterlife/soul';
import { SHIFA_AS_IT_RUNS_SOUL } from '@afterlife/soul/examples/shifa';
import { tablesFromBundle } from '@afterlife/vessel';
import Decimal from 'decimal.js';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { prepareCases, type CaseContext } from './arbitraries';
import {
  proofProperty,
  proveEquivalence,
  vesselOldApp,
  type OldApp,
  type ProofTarget,
} from './runner';
import { shrinkFailure } from './shrink';

const OLD = SHIFA_AS_IT_RUNS_SOUL;
const TODAY = '1998-07-15';
const BUNDLE = new Uint8Array(
  readFileSync(resolve(__dirname, '../../../apps/web/public/graveyard/shifa.jsdos')),
);
const RECORDS: Record<string, DbfRecord[]> = Object.fromEntries(
  Object.entries(tablesFromBundle(BUNDLE, OLD)).map(([f, t]) => [f, t.records]),
);
const withRule = (id: string, expression: string): Soul => ({
  ...OLD,
  rules: OLD.rules.map((r) => (r.id === id ? { ...r, expression } : r)),
});
/** GST rounded where the old app truncates: differs on some bills only. */
const ROUNDED_GST = withRule(
  'gst-17-truncated',
  'round((bill.subtotal - bill.discount) * 0.17, 2)',
);
/** The discount from Rs 4,000 where the old app starts it over Rs 5,000. */
const EARLY_DISCOUNT = withRule(
  'discount-over-5000',
  'if bill.subtotal > 4000 then trunc(bill.subtotal * 0.10, 2) else 0',
);

let resets = 0;
const target = (soul: Soul): ProofTarget => ({
  soul,
  records: RECORDS,
  today: TODAY,
  async withOldApp<R>(work: (old: OldApp) => Promise<R>) {
    const old = vesselOldApp(OLD, RECORDS, TODAY);
    return work({
      run: old.run,
      reset: async () => {
        resets++;
        await old.reset();
      },
    });
  },
});
let ctx: CaseContext;
beforeAll(async () => {
  ctx = await prepareCases(OLD, RECORDS, { today: TODAY });
});

const firstFailure = async (soul: Soul, seed: number) => {
  const r = await proveEquivalence(target(soul), {
    numRuns: 200,
    seed,
    ctx,
    actionId: 'save-bill',
  });
  expect(r.firstFailure, 'the proof finds a difference').not.toBeNull();
  return r.firstFailure!;
};

describe('shrinkFailure', () => {
  // @spec oracle-proof#3.1
  it('shrinks rounded GST to a one-line bill that still differs, each try from a fresh start', async () => {
    const f = await firstFailure(ROUNDED_GST, 21);
    resets = 0;
    const cx = await shrinkFailure(target(ROUNDED_GST), f, {
      seed: 21,
      actionId: 'save-bill',
      ctx,
    });
    expect(cx.reproduced).toBe(true);
    expect(cx.inputs.lines).toHaveLength(1);
    expect(cx.inputs.lines!.length).toBeLessThanOrEqual(f.inputs.lines!.length);
    expect(cx.differences).toContainEqual(
      expect.objectContaining({ table: 'BILLS.DBF', field: 'GST' }),
    );
    // A fresh start for every try: the old app started again each time.
    expect(resets).toBe(cx.tries);
    // Both sides kept, in the data files' own diff format.
    expect(cx.old.tables['BILLS.DBF']!.inserted).toHaveLength(1);
    expect(cx.vessel.tables['BILLS.DBF']!.inserted).toHaveLength(1);
  });

  it('the counterexample replays from its seed and path, and still differs (round-trip)', async () => {
    const f = await firstFailure(ROUNDED_GST, 22);
    const cx = await shrinkFailure(target(ROUNDED_GST), f, {
      seed: 22,
      actionId: 'save-bill',
      ctx,
    });
    let replayed: unknown = null;
    await fc.check(
      proofProperty(ctx, 'save-bill', async (c) => {
        replayed ??= c;
      }),
      { seed: cx.seed, path: cx.path, numRuns: 1 },
    );
    expect(replayed).toEqual({ actionId: cx.actionId, inputs: cx.inputs });
  });

  it('shrinks an early discount to a bill just over Rs 4,000 and at most Rs 5,000', async () => {
    const f = await firstFailure(EARLY_DISCOUNT, 23);
    const cx = await shrinkFailure(target(EARLY_DISCOUNT), f, {
      seed: 23,
      actionId: 'save-bill',
      ctx,
    });
    expect(cx.reproduced).toBe(true);
    const bill = cx.old.tables['BILLS.DBF']!.inserted[0]!.values;
    const sub = new Decimal(String(bill.SUBTOTAL));
    expect(sub.gt(4000) && sub.lte(5000)).toBe(true);
    expect(cx.explanation).toMatch(
      /^Old app charged Rs 0\.00 discount, new app charged Rs \d+\.\d\d, on a bill of Rs \d+\.\d\d \(/,
    );
  });

  it('a case that differed only after the cases before it is kept as it was, and said so', async () => {
    // The old app forgets a stock decrement only on its second bill: fresh, nothing differs.
    let bills = 0;
    const t: ProofTarget = {
      ...target(OLD),
      async withOldApp<R>(work: (old: OldApp) => Promise<R>) {
        const old = vesselOldApp(OLD, RECORDS, TODAY);
        return work({
          run: async (c) => {
            const r = await old.run(c);
            if (c.actionId === 'save-bill' && ++bills === 2)
              delete r.effects.tables['MEDICINE.DBF'];
            return r;
          },
          reset: async () => {
            bills = 0;
            await old.reset();
          },
        });
      },
    };
    const r = await proveEquivalence(t, { numRuns: 30, seed: 4, ctx, actionId: 'save-bill' });
    const f = r.firstFailure!;
    expect(f).not.toBeNull();
    const cx = await shrinkFailure(t, f, {
      seed: 4,
      actionId: 'save-bill',
      ctx,
      timeLimitMs: 5_000,
    });
    expect(cx.reproduced).toBe(false);
    expect(cx.inputs).toEqual(f.inputs);
    expect(cx.shrinks).toBe(0);
    expect(cx.differences).toEqual(f.differences);
  });

  it('stops at its time limit and keeps the smallest case found so far', async () => {
    const f = await firstFailure(ROUNDED_GST, 21);
    const slow: ProofTarget = {
      ...target(ROUNDED_GST),
      async withOldApp<R>(work: (old: OldApp) => Promise<R>) {
        const old = vesselOldApp(OLD, RECORDS, TODAY);
        return work({
          run: async (c) => {
            await new Promise((res) => setTimeout(res, 30));
            return old.run(c);
          },
          reset: old.reset,
        });
      },
    };
    const cx = await shrinkFailure(slow, f, {
      seed: 21,
      actionId: 'save-bill',
      ctx,
      timeLimitMs: 100,
    });
    expect(cx.interrupted).toBe(true);
    expect(cx.differences.length).toBeGreaterThan(0);
  });
});
