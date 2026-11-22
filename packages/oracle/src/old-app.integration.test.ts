// @spec oracle-proof#2.2 The old app in the emulator: the real Shifa in headless js-dos, driven to
// the action's screen by the screen graph and typed by the action's macro.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HeadlessPool } from '@afterlife/emulator/headless';
import type { Soul } from '@afterlife/soul';
// The Soul of the app as it really runs, Y2K expiry check and all (the strict proof's Soul).
import { SHIFA_AS_IT_RUNS_SOUL as SOUL } from '@afterlife/soul/examples/shifa';
import { tablesFromBundle } from '@afterlife/vessel';
import { afterAll, describe, expect, it } from 'vitest';
import { emulatorOldApp } from './old-app';
import { proveEquivalence, type OldApp, type ProofTarget } from './runner';

const BUNDLE = new Uint8Array(
  readFileSync(resolve(__dirname, '../../../apps/web/public/graveyard/shifa.jsdos')),
);
const DOS_TIME = '1998-07-15 10:00:00';
const RECORDS = Object.fromEntries(
  Object.entries(tablesFromBundle(BUNDLE, SOUL)).map(([f, t]) => [f, t.records]),
);
const GRAPH = {
  nodes: SOUL.screens.map((s) => ({ fingerprint: s.id, title: s.title, firstSeen: 0, visits: 1 })),
  edges: SOUL.screens.flatMap((s) =>
    s.navigation.map((n) => ({ from: s.id, to: n.to, keys: n.keys, count: 1 })),
  ),
};
const pool = new HeadlessPool({ size: 1, cycles: 60_000, keyDelayMs: 50 });
afterAll(() => pool.close());

const target = (soul: Soul): ProofTarget => ({
  soul,
  records: RECORDS,
  today: DOS_TIME.slice(0, 10),
  withOldApp: <R>(work: (old: OldApp) => Promise<R>) =>
    pool.use(BUNDLE, (emu) => work(emulatorOldApp(emu, { soul: SOUL, graph: GRAPH })), {
      dosTime: DOS_TIME,
    }),
});

describe('emulatorOldApp on the real Shifa', () => {
  it('bills and customers typed into the 1998 app match the Vessel, case after case', async () => {
    const r = await proveEquivalence(target(SOUL), { numRuns: 6, seed: 1998 });
    expect(r.failed, JSON.stringify(r.firstFailure)).toBe(0);
    expect(r.passed).toBeGreaterThanOrEqual(4);
    const bill = r.cases.find((c) => c.outcome === 'pass' && c.actionId === 'save-bill')!;
    expect(bill.old!.tables['BILLS.DBF']!.inserted).toHaveLength(1);
    // Its screen after the bill, read back from the emulator's pixels.
    expect(bill.screen!.join('\n')).toContain('SHIFA MEDICAL STORE');
  }, 180_000);

  it('a Vessel charging 18% GST differs from the old app’s 17%', async () => {
    const wrong: Soul = {
      ...SOUL,
      rules: SOUL.rules.map((x) =>
        x.id === 'gst-17-truncated'
          ? { ...x, expression: x.expression.replace('0.17', '0.18') }
          : x,
      ),
    };
    const r = await proveEquivalence(target(wrong), {
      numRuns: 2,
      seed: 7,
      actionId: 'save-bill',
    });
    expect(r.failed).toBeGreaterThan(0);
    expect(r.firstFailure!.differences).toContainEqual(
      expect.objectContaining({ table: 'BILLS.DBF', field: 'GST' }),
    );
  }, 180_000);
});
