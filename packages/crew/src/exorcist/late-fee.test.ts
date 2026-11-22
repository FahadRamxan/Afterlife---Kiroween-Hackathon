// @spec exorcist#1.2 The late fee probes (Prompt 73): which dates to type a payment on in the old
// app, and what its answers show. Only the old app's own numbers decide.
import Decimal from 'decimal.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { recordedInput } from './testing';
import { judgeLateFee, lateFeePlan, weeksBy, type LateFeeResult } from './late-fee';

const iqra = recordedInput('iqra');
const shifa = recordedInput('shifa');

describe('lateFeePlan', () => {
  it('Iqra: the fee was due on the 10th; the recorded payment was 2 days late at 1 week', () => {
    const plan = lateFeePlan(iqra)!;
    expect(plan).toMatchObject({
      target: 'payment.late_fee',
      field: 'LATE_FEE',
      due: '2001-03-10',
      feePerWeek: '50',
      actionId: 'add-payment',
      inputs: { values: { STU_ID: 'S0001' } },
    });
    expect(plan.observed).toEqual([
      expect.objectContaining({ date: '2001-03-12', lateFee: '50.00' }),
    ]);
    // Dates that tell the three ways of counting apart, after the due date and in its month.
    // At least two: one alone would rest everything on one date.
    expect(plan.probes.length).toBeGreaterThanOrEqual(2);
    for (const d of plan.probes) expect(d > '2001-03-10' && d <= '2001-03-31').toBe(true);
    const all = [...plan.observed.map((o) => o.date), ...plan.probes];
    const predictions = (['calendar-weeks', 'days-up', 'days-down'] as const).map((m) =>
      all.map((d) => weeksBy(m, plan.due, d)).join(','),
    );
    expect(new Set(predictions).size).toBe(3);
  });

  it('an app with no late fee on screen has no plan', () => {
    expect(lateFeePlan(shifa)).toBeNull();
  });
});

describe('weeksBy', () => {
  it('calendar weeks cross on Monday; days late count 7 to a week', () => {
    // Due Saturday 10 March 2001.
    expect(weeksBy('calendar-weeks', '2001-03-10', '2001-03-11')).toBe(0); // Sunday, same week
    expect(weeksBy('calendar-weeks', '2001-03-10', '2001-03-12')).toBe(1); // Monday
    expect(weeksBy('calendar-weeks', '2001-03-10', '2001-03-18')).toBe(1);
    expect(weeksBy('days-up', '2001-03-10', '2001-03-11')).toBe(1);
    expect(weeksBy('days-up', '2001-03-10', '2001-03-18')).toBe(2);
    expect(weeksBy('days-down', '2001-03-10', '2001-03-16')).toBe(0);
  });

  it('days late counting is never below calendar weeks by more than one (invariant)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3000 }),
        fc.integer({ min: 1, max: 60 }),
        (d0, late) => {
          const due = new Date(Date.UTC(1995, 0, 1 + d0)).toISOString().slice(0, 10);
          const paid = new Date(Date.UTC(1995, 0, 1 + d0 + late)).toISOString().slice(0, 10);
          const cal = weeksBy('calendar-weeks', due, paid);
          expect(Math.abs(cal - weeksBy('days-up', due, paid))).toBeLessThanOrEqual(1);
          expect(Math.abs(cal - weeksBy('days-down', due, paid))).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});

describe('judgeLateFee', () => {
  const plan = lateFeePlan(iqra)!;
  // An old app counting this way would have charged its own fee on the recorded day too.
  const as = (model: 'calendar-weeks' | 'days-up' | 'days-down') => ({
    ...plan,
    observed: plan.observed.map((o) => ({
      ...o,
      lateFee: new Decimal(plan.feePerWeek).times(weeksBy(model, plan.due, o.date)).toFixed(2),
    })),
  });
  const answers = (model: 'calendar-weeks' | 'days-up' | 'days-down'): LateFeeResult[] =>
    plan.probes.map((date) => ({
      date,
      ref: `probe ${date}`,
      lateFee: new Decimal(plan.feePerWeek).times(weeksBy(model, plan.due, date)).toFixed(2),
    }));

  it('an old app that counts calendar weeks crossed is a finding, with the probes as evidence', () => {
    const f = judgeLateFee(iqra, plan, answers('calendar-weeks'))!;
    expect(f).toMatchObject({
      code: 'date-arithmetic:payment.late_fee',
      smell: 'date-arithmetic',
      severity: 'medium',
      target: 'payment.late_fee',
    });
    expect(f.en).toContain('calendar weeks');
    expect(f.evidence.filter((e) => e.kind === 'probe')).toHaveLength(plan.probes.length);
    expect(f.evidence.find((e) => e.kind === 'probe')!.text).toMatch(
      /days late .* Rs \d+\.\d\d; counted by days it would be Rs/,
    );
  });

  it('an old app that counts days late is fine: no finding', () => {
    expect(judgeLateFee(iqra, as('days-up'), answers('days-up'))).toBeNull();
    expect(judgeLateFee(iqra, as('days-down'), answers('days-down'))).toBeNull();
  });

  it('no answers, or answers no way of counting explains: no finding (no evidence)', () => {
    expect(judgeLateFee(iqra, plan, [])).toBeNull();
    expect(
      judgeLateFee(
        iqra,
        plan,
        plan.probes.map((date) => ({ date, ref: date, lateFee: '7.00' })),
      ),
    ).toBeNull();
    expect(
      judgeLateFee(
        iqra,
        plan,
        plan.probes.map((date) => ({ date, ref: date, lateFee: null })),
      ),
    ).toBeNull();
  });
});
