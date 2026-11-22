// @spec oracle-proof#2 The differential runner (Prompt 68), with a Vessel standing in for the old
// app: fast, and exact, so a changed rule is the only thing that can differ.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DbfRecord } from '@afterlife/dbf';
import type { Soul } from '@afterlife/soul';
import { SHIFA_AS_IT_RUNS_SOUL, SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import { tablesFromBundle } from '@afterlife/vessel';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { prepareCases, type CaseContext, type ProofCase } from './arbitraries';
import {
  proofCases,
  proofProperty,
  proveEquivalence,
  vesselOldApp,
  type OldApp,
  type ProofTarget,
} from './runner';

const SOUL = SHIFA_REFERENCE_SOUL;
const TODAY = '1998-07-15';
const BUNDLE = new Uint8Array(
  readFileSync(resolve(__dirname, '../../../apps/web/public/graveyard/shifa.jsdos')),
);
const RECORDS: Record<string, DbfRecord[]> = Object.fromEntries(
  Object.entries(tablesFromBundle(BUNDLE, SOUL)).map(([f, t]) => [f, t.records]),
);
const RUNS = Math.min(Number(process.env.FC_NUM_RUNS ?? 100), 200);

/** The reborn app runs `soul`; the old app is the reference Soul in a Vessel. */
function target(
  soul: Soul = SOUL,
  oldApp: () => OldApp = () => vesselOldApp(SOUL, RECORDS, TODAY),
): ProofTarget & { opened: number } {
  const t = {
    soul,
    records: RECORDS,
    today: TODAY,
    opened: 0,
    async withOldApp<R>(work: (old: OldApp) => Promise<R>) {
      t.opened++;
      return work(oldApp());
    },
  };
  return t;
}

/** Shifa with GST one point higher in the reborn app: 18% where the old app charges 17%. */
const WRONG_GST: Soul = {
  ...SOUL,
  rules: SOUL.rules.map((r) =>
    r.id === 'gst-17-truncated' ? { ...r, expression: r.expression.replace('0.17', '0.18') } : r,
  ),
};

let ctx: CaseContext;
beforeAll(async () => {
  ctx = await prepareCases(SOUL, RECORDS, { today: TODAY });
});

describe('proveEquivalence', () => {
  // @spec oracle-proof#2.1
  it('the old app’s own Soul in the Vessel never differs from it, on any seed (Property 4)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer(), fc.integer({ min: 1, max: 3 }), async (seed, lanes) => {
        const r = await proveEquivalence(target(), { numRuns: 30, seed, lanes, ctx });
        expect(r.failed, JSON.stringify(r.firstFailure)).toBe(0);
        expect(r.passed + r.skipped).toBe(30);
        expect(r.passed).toBeGreaterThan(0);
      }),
      { numRuns: Math.max(5, Math.floor(RUNS / 20)) },
    );
  });

  // @spec oracle-proof#2.3
  it('a changed rule in the Vessel is found as a difference, naming the table and field', async () => {
    const r = await proveEquivalence(target(WRONG_GST), { numRuns: RUNS, seed: 1, ctx });
    expect(r.failed).toBeGreaterThan(0);
    const f = r.firstFailure!;
    expect(f.outcome).toBe('fail');
    expect(f.differences).toContainEqual(
      expect.objectContaining({ table: 'BILLS.DBF', kind: 'inserted', field: 'GST' }),
    );
    // Its two sides are kept, in the data files' own diff format.
    expect(f.old!.tables['BILLS.DBF']!.inserted).toHaveLength(1);
    expect(f.vessel!.tables['BILLS.DBF']!.inserted).toHaveLength(1);
  });

  it('every case still runs after a difference, and only the bills table differs', async () => {
    const r = await proveEquivalence(target(WRONG_GST), { numRuns: RUNS, seed: 2, ctx });
    // Lanes start again after a difference, so every case still runs.
    expect(r.passed + r.failed + r.skipped).toBe(RUNS);
    for (const c of r.cases.filter((x) => x.outcome === 'fail'))
      expect(c.differences!.every((d) => d.table === 'BILLS.DBF')).toBe(true);
  });

  // @spec oracle-proof#2.2
  it('is repeatable: the same seed gives the same cases and outcomes, on any number of lanes', async () => {
    const a = await proveEquivalence(target(WRONG_GST), { numRuns: 40, seed: 9, lanes: 1, ctx });
    const b = await proveEquivalence(target(WRONG_GST), { numRuns: 40, seed: 9, lanes: 1, ctx });
    const strip = (r: typeof a) => r.cases.map((c) => ({ ...c, ms: 0 }));
    expect(strip(b)).toEqual(strip(a));
    const c = await proveEquivalence(target(WRONG_GST), { numRuns: 40, seed: 9, lanes: 3, ctx });
    expect(c.cases.map((x) => x.inputs)).toEqual(a.cases.map((x) => x.inputs));
    expect(new Set(c.cases.map((x) => x.lane))).toEqual(new Set([0, 1, 2]));
  });

  it('case i replays alone with fast-check’s path i, from the seed', async () => {
    const cases = await proofCases(ctx, { numRuns: 20, seed: 42 });
    expect(cases).toHaveLength(20);
    for (const i of [0, 7, 12, 19]) {
      let seen: ProofCase | null = null;
      await fc.assert(
        proofProperty(ctx, undefined, async (c) => {
          seen ??= c;
        }),
        { seed: 42, path: String(i), numRuns: 1 },
      );
      expect(seen).toEqual(cases[i]);
    }
  });

  it('runs a lane per old app, and starts each again from its own records every 25 cases', async () => {
    let resets = 0;
    const t = target(SOUL, () => {
      const old = vesselOldApp(SOUL, RECORDS, TODAY);
      return {
        run: old.run,
        reset: async () => {
          resets++;
          await old.reset();
        },
      };
    });
    const r = await proveEquivalence(t, { numRuns: 100, seed: 3, lanes: 2, ctx });
    expect(t.opened).toBe(2);
    // 50 cases a lane: started again after 25 (the start itself is the lane's fresh boot).
    expect(resets).toBe(2);
    expect(r.failed).toBe(0);
  });

  // @spec oracle-proof#2.4
  it('a case the records no longer allow (the stock ran out) is skipped on both sides', async () => {
    // One of each medicine in stock: the second bill naming one is refused.
    const thin = Object.fromEntries(
      Object.entries(RECORDS).map(([f, rs]) => [
        f,
        f === 'MEDICINE.DBF' ? rs.map((r) => ({ ...r, values: { ...r.values, QTY: '1' } })) : rs,
      ]),
    );
    const thinCtx = await prepareCases(SOUL, thin, { today: TODAY });
    let ran = 0;
    const t = {
      ...target(),
      records: thin,
      async withOldApp<R>(work: (old: OldApp) => Promise<R>) {
        const old = vesselOldApp(SOUL, thin, TODAY);
        return work({ ...old, run: (c) => (ran++, old.run(c)) });
      },
    };
    const r = await proveEquivalence(t, {
      numRuns: 60,
      seed: 5,
      restartEvery: 1000,
      ctx: thinCtx,
    });
    expect(r.skipped).toBeGreaterThan(0);
    expect(r.failed).toBe(0);
    expect(ran).toBe(r.passed);
    const skip = r.cases.find((c) => c.outcome === 'skip')!;
    expect(skip.reason).toMatch(/stock|STOCK/i);
    expect(skip.old).toBeUndefined();
  });

  it('a reborn app whose rule cannot be worked out differs: it is not a skip', async () => {
    const broken: Soul = {
      ...SOUL,
      rules: SOUL.rules.map((r) =>
        r.id === 'gst-17-truncated' ? { ...r, expression: 'bill.nonsense * 0.17' } : r,
      ),
    };
    const r = await proveEquivalence(target(broken), {
      numRuns: 20,
      seed: 3,
      ctx,
      actionId: 'save-bill',
    });
    expect(r.skipped).toBe(0);
    expect(r.failed).toBe(20);
    expect(r.cases[0]!.reason).toMatch(/^The reborn app could not work it out: .*nonsense/);
  });

  it('an old app that cannot be driven is tried once more from a fresh start, then fails', async () => {
    let calls = 0;
    let resets = 0;
    const flaky = (failures: number) =>
      target(SOUL, () => {
        const old = vesselOldApp(SOUL, RECORDS, TODAY);
        return {
          run: async (c) => {
            if (calls++ < failures) throw new Error('No key path from fp_x to fp_y');
            return old.run(c);
          },
          reset: async () => {
            resets++;
            await old.reset();
          },
        };
      });
    const once = await proveEquivalence(flaky(1), { numRuns: 5, seed: 8, ctx });
    expect(once.failed).toBe(0);
    expect(resets).toBe(1);
    calls = 0;
    resets = 0;
    const twice = await proveEquivalence(flaky(2), { numRuns: 5, seed: 8, ctx });
    expect(twice.cases[0]!.outcome).toBe('fail');
    expect(twice.cases[0]!.reason).toBe(
      'The old app could not run it: No key path from fp_x to fp_y',
    );
    expect(twice.cases.slice(1).every((c) => c.outcome !== 'fail')).toBe(true);
  });

  it('reports each case as it finishes', async () => {
    const seen: number[] = [];
    const r = await proveEquivalence(target(), {
      numRuns: 12,
      seed: 4,
      lanes: 2,
      ctx,
      onCase: (c) => void seen.push(c.index),
    });
    expect(seen.sort((a, b) => a - b)).toEqual(r.cases.map((c) => c.index));
    expect(r.cases.map((c) => c.index)).toEqual([...Array(12).keys()]);
  });
});

describe('Shifa as the 1998 app really runs (its Y2K expiry check)', () => {
  const expiry = new Map(
    RECORDS['MEDICINE.DBF']!.map((r) => [String(r.values.CODE).trim(), String(r.values.EXPIRY)]),
  );
  const y2kLine = (c: { inputs: ProofCase['inputs'] }) =>
    (c.inputs.lines ?? []).some((l) => expiry.get(l.CODE!)! >= '20000101');

  it('leaves batches good until 2000 or later out of its cases: the old app refuses them', async () => {
    const legacy = await prepareCases(SHIFA_AS_IT_RUNS_SOUL, RECORDS, { today: TODAY });
    const codes = legacy.actions.find((a) => a.actionId === 'save-bill')!.lineRecords;
    expect(codes.length).toBeGreaterThan(0);
    for (const r of codes) expect(expiry.get(r.key)! < '20000101', r.key).toBe(true);
    expect(codes.some((r) => r.key === 'INS100')).toBe(true);
  });

  it('the reference Soul differs from it only on bills with a batch good until 2000 or later', async () => {
    const t = target(SOUL, () => vesselOldApp(SHIFA_AS_IT_RUNS_SOUL, RECORDS, TODAY));
    const r = await proveEquivalence(t, { numRuns: RUNS, seed: 6, ctx });
    expect(r.failed).toBeGreaterThan(0);
    for (const c of r.cases.filter((x) => x.outcome === 'fail'))
      expect(y2kLine(c), JSON.stringify(c.inputs)).toBe(true);
  });

  it('proved against itself, never differs', async () => {
    const legacy = await prepareCases(SHIFA_AS_IT_RUNS_SOUL, RECORDS, { today: TODAY });
    const t = target(SHIFA_AS_IT_RUNS_SOUL, () =>
      vesselOldApp(SHIFA_AS_IT_RUNS_SOUL, RECORDS, TODAY),
    );
    const r = await proveEquivalence(t, { numRuns: RUNS, seed: 6, ctx: legacy });
    expect(r.failed).toBe(0);
  });
});

describe('accepted divergences and reused cases (Prompt 74)', () => {
  // The old app is Shifa as it really runs (two-digit years); the reborn app compares four-digit
  // years, as the owner chose (Fix). The old behaviour is the app as it runs.
  const fixedTarget = () => target(SOUL, () => vesselOldApp(SHIFA_AS_IT_RUNS_SOUL, RECORDS, TODAY));

  // @spec exorcist#2.2
  it('a difference the old behaviour explains is accepted, not failed', async () => {
    const strict = await proveEquivalence(fixedTarget(), { numRuns: RUNS, seed: 6, ctx });
    expect(strict.failed).toBeGreaterThan(0);
    const r = await proveEquivalence(fixedTarget(), {
      numRuns: RUNS,
      seed: 6,
      ctx,
      oldBehaviour: SHIFA_AS_IT_RUNS_SOUL,
    });
    expect(r.failed).toBe(0);
    expect(r.accepted).toBe(strict.failed);
    const a = r.cases.find((c) => c.outcome === 'accepted')!;
    expect(a.differences!.length).toBeGreaterThan(0);
    expect(r.passed + r.accepted + r.skipped).toBe(RUNS);
  });

  it('a difference the old behaviour does not explain still fails', async () => {
    // GST at 18% is no fix the owner made: with the fixes undone (the expiry check back to two-digit
    // years, as undoFixes makes it) the reborn app still charges 18%, which the old app does not.
    const oldBehaviour: Soul = {
      ...SHIFA_AS_IT_RUNS_SOUL,
      rules: SHIFA_AS_IT_RUNS_SOUL.rules.map((x) =>
        x.id === 'gst-17-truncated'
          ? { ...x, expression: x.expression.replace('0.17', '0.18') }
          : x,
      ),
    };
    const r = await proveEquivalence(target(WRONG_GST), {
      numRuns: 40,
      seed: 1,
      ctx,
      oldBehaviour,
    });
    expect(r.failed).toBeGreaterThan(0);
    expect(r.accepted).toBe(0);
  });

  it('a case reused from the last proof is not run on the old app again', async () => {
    let runs = 0;
    const t = target(SOUL, () => {
      const old = vesselOldApp(SOUL, RECORDS, TODAY);
      return { ...old, run: (c) => (runs++, old.run(c)) };
    });
    const r = await proveEquivalence(t, {
      numRuns: 20,
      seed: 3,
      ctx,
      reuse: (c, i) =>
        i % 2 === 0 ? { actionId: c.actionId, inputs: c.inputs, outcome: 'pass' } : null,
    });
    expect(r.reused).toBe(10);
    expect(r.cases.filter((c) => c.reused).map((c) => c.index)).toEqual([
      0, 2, 4, 6, 8, 10, 12, 14, 16, 18,
    ]);
    expect(runs).toBeLessThanOrEqual(10);
    expect(r.failed).toBe(0);
  });
});
