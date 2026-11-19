import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { LiveEvent } from './live';
import { possessionStats } from './possession';

let seq = 0;
const obs = (step: number, extra: Partial<Record<string, unknown>> = {}): LiveEvent => ({
  seq: ++seq,
  type: 'observation',
  at: '2026-11-19T10:00:00.000Z',
  payload: {
    step,
    label: `step ${step}`,
    to: 'NEW BILL',
    newScreen: false,
    changed: [],
    errors: [],
    screens: 1,
    saves: 0,
    ...extra,
  },
});

describe('possessionStats', () => {
  it('is null before the first observation', () => {
    expect(possessionStats([])).toBeNull();
    expect(
      possessionStats([{ seq: 1, type: 'log', payload: { message: 'x' }, at: '' }]),
    ).toBeNull();
  });

  it('takes the totals from the newest observation, and keeps the last few steps', () => {
    const s = possessionStats([
      obs(1, { newScreen: true, screens: 2 }),
      obs(2, { screens: 3, newScreen: true }),
      obs(3, { screens: 3, saves: 1, changed: ['BILLS.DBF'], label: 'F2=Save bill' }),
    ])!;
    expect(s).toMatchObject({ screens: 3, actions: 3, changes: 1 });
    expect(s.recent.map((r) => r.label)).toEqual(['step 1', 'step 2', 'F2=Save bill']);
  });

  it('lists what the app refused, each error once, with the value that caused it (Prompt 49)', () => {
    const s = possessionStats([
      obs(1),
      obs(2, { label: 'Code = ZZZ999 (new-key)', errors: ['MEDICINE NOT FOUND'] }),
      obs(3, { label: 'Code = ZZZ999 (new-key)', errors: ['MEDICINE NOT FOUND'] }),
      obs(4, { label: 'Qty = 9999 (max-width)', errors: ['NOT ENOUGH STOCK'] }),
    ])!;
    expect(s.refused).toEqual([
      { text: 'MEDICINE NOT FOUND', label: 'Code = ZZZ999 (new-key)', step: 2 },
      { text: 'NOT ENOUGH STOCK', label: 'Qty = 9999 (max-width)', step: 4 },
    ]);
  });

  it("counts the steps on the owner's path and keeps what the owner said (Prompt 50)", () => {
    const s = possessionStats([
      obs(1, { kind: 'guide', label: 'owner pressed 3', hint: 'naya gahak' }),
      obs(2, { kind: 'guide', label: 'owner pressed A' }),
      obs(3, { kind: 'explore' }),
    ])!;
    expect(s.guided).toBe(2);
    expect(s.hints).toEqual([{ step: 1, label: 'owner pressed 3', hint: 'naya gahak' }]);
    expect(possessionStats([obs(1)])!).toMatchObject({ guided: 0, hints: [] });
  });

  it('a re-run starts counting again, and a malformed event is ignored', () => {
    const s = possessionStats([
      obs(1),
      obs(2, { screens: 4, saves: 2 }),
      { seq: ++seq, type: 'observation', at: '', payload: { step: 'x' } },
      obs(1, { screens: 1 }),
    ])!;
    expect(s).toMatchObject({ screens: 1, actions: 1, changes: 0 });
    expect(s.recent).toHaveLength(1);
  });

  it('the counters never go backwards within a run (invariant)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.nat(3), fc.nat(2)), { minLength: 1, maxLength: 30 }),
        (deltas) => {
          let screens = 1;
          let saves = 0;
          const events = deltas.map(([ds, dv], i) =>
            obs(i + 1, { screens: (screens += ds), saves: (saves += dv) }),
          );
          let prev = { screens: 0, actions: 0, changes: 0 };
          for (let n = 1; n <= events.length; n++) {
            const s = possessionStats(events.slice(0, n))!;
            expect(s.screens).toBeGreaterThanOrEqual(prev.screens);
            expect(s.actions).toBeGreaterThan(prev.actions);
            expect(s.changes).toBeGreaterThanOrEqual(prev.changes);
            prev = s;
          }
        },
      ),
    );
  });
});
