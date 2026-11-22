// @spec oracle-proof#4.2 The proof's progress and its counterexample, for the Proof tab (Prompt 70).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { LiveEvent } from './live';
import { ProofSchema, proofCounter, proofProgress } from './proof';

let seq = 0;
const ev = (type: string, payload: unknown): LiveEvent => ({ seq: ++seq, type, at: '', payload });
const kase = (index: number, outcome: 'pass' | 'fail' | 'skip', done: number, failed = 0) =>
  ev('proof_case', {
    index,
    of: 50,
    done,
    failed,
    skipped: 0,
    lane: index % 2,
    actionId: 'save-bill',
    inputs: { values: { CUST_ID: '' }, lines: [{ CODE: 'PAN500', QTY: '2' }] },
    outcome,
    screen: ['SHIFA MEDICAL STORE', 'Bill 9807-0001 saved'],
    old: { BILL_NO: '9807-0001', TOTAL: '29.25' },
    vessel: { BILL_NO: '9807-0001', TOTAL: '29.25' },
    ms: 4200,
  });

describe('proofProgress', () => {
  it('the newest totals, the case just run, and the log of cases', () => {
    const p = proofProgress([
      kase(0, 'pass', 1),
      ev('log', { level: 'info', message: 'x' }),
      kase(1, 'fail', 2, 1),
      ev('proof_case', { nonsense: true }),
    ]);
    expect(p).toMatchObject({ done: 2, of: 50, failed: 1, skipped: 0 });
    expect(p!.latest.index).toBe(1);
    expect(p!.latest.screen).toEqual(['SHIFA MEDICAL STORE', 'Bill 9807-0001 saved']);
    expect(p!.cases.map((c) => [c.index, c.outcome])).toEqual([
      [1, 'fail'],
      [0, 'pass'],
    ]);
  });

  it('nothing yet before the first case; a new run of the step starts again', () => {
    expect(proofProgress([ev('log', { level: 'info', message: 'x' })])).toBeNull();
    expect(
      proofProgress([
        kase(0, 'pass', 1),
        ev('step', { step: 'prove', state: 'started', attempt: 2 }),
      ]),
    ).toBeNull();
  });

  it('the counter reads "N / M cases · K differences"', () => {
    expect(proofCounter({ done: 1200, of: 2000, failed: 0 })).toBe(
      '1,200 / 2,000 cases · 0 differences',
    );
    expect(proofCounter({ done: 50, of: 50, failed: 1 })).toBe('50 / 50 cases · 1 difference');
  });

  it('the totals are the newest event’s, however many events came before (invariant)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('pass', 'fail', 'skip'), { minLength: 1, maxLength: 60 }),
        (xs) => {
          let failed = 0;
          const events = xs.map((o, i) => {
            if (o === 'fail') failed++;
            return kase(i, o as 'pass', i + 1, failed);
          });
          const p = proofProgress(events)!;
          expect(p.done).toBe(xs.length);
          expect(p.failed).toBe(xs.filter((o) => o === 'fail').length);
          expect(p.cases.length).toBeLessThanOrEqual(20);
        },
      ),
    );
  });
});

describe('ProofSchema', () => {
  it('reads the steps API’s proof, counterexample and all', () => {
    const p = ProofSchema.parse({
      soulVersion: 2,
      seed: 42,
      numRuns: 50,
      lanes: 2,
      passed: 47,
      failed: 1,
      skipped: 2,
      counterexample: {
        index: 7,
        actionId: 'save-bill',
        inputs: { lines: [{ CODE: 'PAN500', QTY: '1' }] },
        seed: 42,
        path: '7:0',
        explanation:
          'Old app charged Rs 2.12 GST, new app charged Rs 2.13, on a bill of Rs 12.50 (PAN500 x 1).',
        differences: [
          {
            table: 'BILLS.DBF',
            kind: 'inserted',
            record: 'BILL_NO 9807-0001',
            field: 'GST',
            old: '2.12',
            vessel: '2.13',
          },
        ],
        shrinks: 3,
        tries: 9,
        reproduced: true,
        old: null,
        vessel: null,
      },
    });
    expect(p.counterexample!.differences[0]!.field).toBe('GST');
    // @spec rebirth-certificate#2.3 Whether a certificate was issued (Prompt 71).
    expect(p.certificate).toEqual({ reason: null, id: null });
    const issued = ProofSchema.parse({
      ...p,
      counterexample: null,
      certificate: { id: '0192b6a0-0000-7000-8000-000000000001' },
    });
    expect(issued.certificate).toEqual({
      id: '0192b6a0-0000-7000-8000-000000000001',
      reason: null,
    });
  });
});
