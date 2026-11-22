// @spec exorcist#1.3 All the detectors at once, and the score against the manifests (Prompt 73).
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { exorcise } from './exorcise';
import { lateFeePlan, weeksBy } from './late-fee';
import { scoreExorcism } from './score';
import { recordedInput } from './testing';
import type { Finding } from './types';

const finding = (code: string, smell: Finding['smell'], target?: string): Finding => ({
  code,
  smell,
  severity: 'medium',
  ...(target ? { target } : {}),
  titleEn: 't',
  titleUr: 'ت',
  en: 'e',
  ur: 'ا',
  since: 1998,
  evidence: [{ kind: 'record', ref: 'x', text: 'x' }],
});

describe('exorcise', () => {
  it('Shifa: its two-digit years and its negative stock, most severe first, one finding per code', () => {
    const fs = exorcise(recordedInput('shifa'));
    expect(fs.map((f) => f.code)).toEqual(
      expect.arrayContaining(['two-digit-year:medicine.expiry', 'negative-allowed:medicine.qty']),
    );
    expect(new Set(fs.map((f) => f.code)).size).toBe(fs.length);
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < fs.length; i++)
      expect(rank[fs[i - 1]!.severity]).toBeLessThanOrEqual(rank[fs[i]!.severity]);
  });

  it('Iqra: with the probes answered as the old app does, its late fee', () => {
    const input = recordedInput('iqra');
    const plan = lateFeePlan(input)!;
    const results = plan.probes.map((date) => ({
      date,
      ref: `probe ${date}`,
      lateFee: new Decimal(plan.feePerWeek)
        .times(weeksBy('calendar-weeks', plan.due, date))
        .toFixed(2),
    }));
    expect(exorcise(input).map((f) => f.code)).not.toContain('date-arithmetic:payment.late_fee');
    expect(exorcise(input, { plan, results }).map((f) => f.code)).toContain(
      'date-arithmetic:payment.late_fee',
    );
  });
});

describe('scoreExorcism', () => {
  const bugs = [
    { id: 'y2k', truth: { smell: 'two-digit-year' as const, target: 'medicine.expiry' } },
    { id: 'neg', truth: { smell: 'negative-allowed' as const, target: 'medicine.qty' } },
    { id: 'ovf', truth: { smell: 'numeric-overflow' as const, target: 'bill.discount' } },
  ];
  it('a bug is found by a finding of its smell on its field; the rest are extra', () => {
    const s = scoreExorcism(
      [
        finding('two-digit-year:medicine.expiry', 'two-digit-year', 'medicine.expiry'),
        finding('negative-allowed:customer.qty', 'negative-allowed', 'customer.qty'),
        finding('rounding:app', 'rounding'),
      ],
      bugs,
    );
    expect(s).toEqual({
      found: ['y2k'],
      missed: ['neg', 'ovf'],
      extra: ['negative-allowed:customer.qty', 'rounding:app'],
    });
  });
});
