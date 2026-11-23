// @spec ghost-twin#3 Readiness and switch-over.
// @spec ghost-twin#3.1 The switch-over readiness score (Prompt 78): days of shadow use, transactions
// matched, open mismatches and unknown actions, against "7 days and 200+ matched with 0 open".
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE, readiness, type TwinResult } from './readiness';

const ev = (day: number, outcome: TwinResult['outcome'] | null): TwinResult => ({
  occurredAt: `1998-07-${String(15 + day).padStart(2, '0')}T10:00:00.000Z`,
  outcome,
});
const days = (n: number, perDay: number, outcome: TwinResult['outcome'] = 'matched') =>
  Array.from({ length: n }, (_, d) => Array.from({ length: perDay }, () => ev(d, outcome))).flat();

describe('readiness', () => {
  it('is ready at 7 days and 200 matched with no open mismatch', () => {
    const r = readiness(days(7, 30));
    expect(r).toMatchObject({
      days: 7,
      matched: 210,
      mismatched: 0,
      unknown: 0,
      pending: 0,
      ready: true,
      score: 100,
    });
    expect(r.reasons).toEqual([]);
  });

  it('says what is still missing', () => {
    expect(readiness(days(3, 30)).reasons).toEqual([
      '4 more days of shadow use',
      '110 more matched transactions',
    ]);
    const open = readiness([...days(7, 30), ev(6, 'mismatched')]);
    expect(open.ready).toBe(false);
    expect(open.reasons).toEqual(['1 open mismatch']);
    expect(open.score).toBeLessThan(100);
    expect(readiness([]).reasons[0]).toBe('7 more days of shadow use');
  });

  it('unknown actions are counted and shown, but do not hold the switch back; replays in progress do', () => {
    expect(readiness([...days(7, 30), ev(2, 'unknown')])).toMatchObject({
      unknown: 1,
      ready: true,
    });
    expect(readiness([...days(7, 30), ev(6, null)])).toMatchObject({
      pending: 1,
      ready: false,
      reasons: ['1 transaction still being compared'],
    });
  });

  it('the thresholds can be changed', () => {
    expect(readiness(days(2, 5), { days: 2, matched: 10, openMismatches: 0 }).ready).toBe(true);
    expect(readiness(days(7, 30), { ...DEFAULT_RULE, openMismatches: 1 }).ready).toBe(true);
  });

  it('the score only rises as matched days come in, and is 100 exactly when ready (invariant)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: 9 }),
            fc.constantFrom('matched', 'mismatched', 'unknown'),
          ),
          { maxLength: 400 },
        ),
        (xs) => {
          const events = xs.map(([d, o]) => ev(d, o as TwinResult['outcome']));
          const r = readiness(events);
          expect(r.score >= 0 && r.score <= 100).toBe(true);
          expect(r.score === 100).toBe(r.ready);
          const more = readiness([...events, ev(9, 'matched')]);
          if (!r.mismatched) expect(more.score).toBeGreaterThanOrEqual(r.score);
        },
      ),
    );
  });
});
