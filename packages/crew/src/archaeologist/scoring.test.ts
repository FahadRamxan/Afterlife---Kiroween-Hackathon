import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  normalizeExpression,
  scoreSentence,
  scoreSoul,
  type HiddenRule,
  type InferredSoul,
} from './scoring';
import {
  graveyardEntities,
  graveyardEvidence,
  graveyardHidden,
  shifaEntities,
} from './testing/graveyard-runs';
import { verifyCandidates } from './verify';

const SHIFA = graveyardHidden('shifa');
const SHIFA_EVIDENCE = graveyardEvidence('shifa', shifaEntities());
const BARKAT_ENTITIES = graveyardEntities(
  'barkat',
  { PARTY: 'party', LEDGER: 'ledger' },
  { PARTY: ['PARTY_ID'], LEDGER: ['ENTRY'] },
);
const IQRA_ENTITIES = graveyardEntities(
  'iqra',
  { STUDENT: 'student', FEES: 'fee', PAYMENT: 'payment' },
  { STUDENT: ['STU_ID'], FEES: ['CLASS'], PAYMENT: ['RECEIPT'] },
);

/** The hidden truth written as a Soul: what a perfect Archaeologist would give. */
function perfect(hidden: HiddenRule[]): InferredSoul {
  const soul: InferredSoul = { rules: [], entities: [] };
  for (const h of hidden) {
    const t = h.truth;
    if (t.kind === 'counter') soul.entities.push({ id: t.entity, counters: [t] });
    else if ((t.kind === 'compute' || t.kind === 'effect' || t.kind === 'validate') && t.expression)
      soul.rules.push({
        id: h.id,
        kind: t.kind,
        ...('target' in t ? { target: t.target } : {}),
        expression: t.expression,
      });
  }
  return soul;
}

describe('the hidden truth', () => {
  it('every truth expression of the three samples is in the rule language', () => {
    for (const app of ['shifa', 'iqra', 'barkat'])
      for (const h of graveyardHidden(app))
        if ('expression' in h.truth && h.truth.expression)
          expect(normalizeExpression(h.truth.expression), `${app} ${h.id}`).not.toBeNull();
  });

  it('each sample’s truth gives the old app’s values on its own scenario runs', () => {
    // On the runs that show the rule (the runs of a known bug, such as the discount overflow, differ).
    const check = (h: HiddenRule, target: string, expression: string, evidence = SHIFA_EVIDENCE) =>
      verifyCandidates(
        target,
        [expression],
        evidence.observations.filter((o) => h.scenarios.includes(o.id)),
        evidence.entities,
      );
    for (const h of SHIFA) {
      const t = h.truth;
      if ((t.kind === 'compute' || t.kind === 'effect') && t.expression) {
        const v = check(h, t.target, t.expression);
        expect(v.effects, h.id).toBeGreaterThan(0);
        expect(v.selected?.expression, h.id).toBe(t.expression);
      }
    }
    const barkat = graveyardEvidence('barkat', BARKAT_ENTITIES);
    const rb = graveyardHidden('barkat').find((h) => h.id === 'running-balance')!;
    const balance = rb.truth;
    expect(balance.kind).toBe('effect');
    if (balance.kind === 'effect') {
      const v = check(rb, balance.target, balance.expression!, barkat);
      expect(v.effects).toBeGreaterThan(0);
      expect(v.selected).not.toBeNull();
    }
  });

  it('Iqra’s sibling discount needs the student, which a payment does not write: not checkable from the data', () => {
    const iqra = graveyardEvidence('iqra', IQRA_ENTITIES);
    const t = graveyardHidden('iqra').find((h) => h.id === 'sibling-discount-15')!.truth;
    if (t.kind !== 'compute') throw new Error('a compute rule');
    const v = verifyCandidates(t.target, [t.expression!], iqra.observations, iqra.entities);
    expect(v.effects).toBeGreaterThan(0);
    expect(v.checks[0]!.misses[0]!.error).toMatch(/Nothing is called student/);
  });
});

describe('scoreSoul', () => {
  it('the truth itself scores every rule exact, with full precision', () => {
    const s = scoreSoul(SHIFA, perfect(SHIFA), SHIFA_EVIDENCE);
    expect(s).toMatchObject({
      known: 7,
      inferred: 7,
      recovered: 7,
      exact: 7,
      precision: 1,
      recall: 1,
    });
    expect(scoreSentence('Shifa Medical Store', s)).toBe(
      'Afterlife recovered 7 of 7 hidden rules in Shifa Medical Store (7 exact).',
    );
  });

  it('a rule written differently that gives the same value on every scenario run is equivalent', () => {
    const s = scoreSoul(
      SHIFA,
      {
        rules: [
          {
            id: 'bill-gst',
            kind: 'compute',
            target: 'bill.gst',
            expression: 'floor((bill.subtotal - bill.discount) * 17) / 100',
          },
        ],
        entities: [],
      },
      SHIFA_EVIDENCE,
    );
    expect(s.rules.find((r) => r.id === 'gst-17-truncated')).toEqual({
      id: 'gst-17-truncated',
      status: 'equivalent',
      by: 'rule bill-gst',
    });
    expect(s).toMatchObject({ recovered: 1, exact: 0, precision: 1 });
  });

  it('spacing and brackets do not matter for an exact match', () => {
    expect(normalizeExpression('trunc(( bill.subtotal-bill.discount )*0.17,2)')).toBe(
      normalizeExpression('trunc((bill.subtotal - bill.discount) * 0.17, 2)'),
    );
    expect(normalizeExpression('not a rule (')).toBeNull();
  });

  it('a wrong rule or counter is wrong, and costs precision', () => {
    const s = scoreSoul(
      SHIFA,
      {
        rules: [
          {
            id: 'bill-gst',
            kind: 'compute',
            target: 'bill.gst',
            expression: 'round((bill.subtotal - bill.discount) * 0.17, 2)',
          },
        ],
        entities: [{ id: 'bill', counters: [{ field: 'BILL_NO', pattern: '####-####' }] }],
      },
      SHIFA_EVIDENCE,
    );
    expect(s.rules.find((r) => r.id === 'gst-17-truncated')?.status).toBe('wrong');
    expect(s.rules.find((r) => r.id === 'bill-number-yymm')?.status).toBe('wrong');
    expect(s).toMatchObject({ recovered: 0, precision: 0, recall: 0 });
  });

  it('a right rule the truth does not list (the bill total) does not cost precision', () => {
    const s = scoreSoul(
      SHIFA,
      {
        rules: [
          {
            id: 'bill-total',
            kind: 'compute',
            target: 'bill.total',
            expression: 'bill.subtotal - bill.discount + bill.gst',
          },
          { id: 'bill-subtotal', kind: 'compute', target: 'bill.subtotal', expression: '7' },
        ],
        entities: [],
      },
      SHIFA_EVIDENCE,
    );
    expect(s.extra).toEqual([
      { label: 'rule bill-total', verified: true },
      { label: 'rule bill-subtotal', verified: false },
    ]);
    expect(s).toMatchObject({ recovered: 0, precision: 0.5 });
  });

  it('a Soul with nothing in it: no precision, no recall', () => {
    expect(scoreSoul(SHIFA, { rules: [], entities: [] })).toMatchObject({
      inferred: 0,
      precision: null,
      recall: 0,
    });
  });

  it('a report is never recovered from the data', () => {
    const hidden = graveyardHidden('barkat');
    const s = scoreSoul(hidden, perfect(hidden), graveyardEvidence('barkat', BARKAT_ENTITIES));
    expect(s.rules.find((r) => r.id === 'monthly-reminders')?.status).toBe('missed');
    expect(s.recovered).toBe(4);
  });
});

describe('scoreSoul (properties)', () => {
  const truth = perfect(SHIFA);
  const junk = fc.record({
    id: fc.constantFrom('x-1', 'x-2', 'x-3'),
    kind: fc.constantFrom('compute', 'validate'),
    target: fc.constantFrom('bill.gst', 'bill.discount', 'bill.total', 'medicine.qty'),
    expression: fc.constantFrom('0', '1', 'bill.subtotal', 'medicine.qty - 1'),
  });

  it('dropping rules never raises recall, and junk never raises it (invariant)', () => {
    fc.assert(
      fc.property(
        fc.subarray(truth.rules),
        fc.subarray(truth.entities),
        fc.array(junk, { maxLength: 4 }),
        (rules, entities, extra) => {
          const full = scoreSoul(SHIFA, truth);
          const part = scoreSoul(SHIFA, { rules, entities });
          const noisy = scoreSoul(SHIFA, { rules: [...rules, ...extra], entities });
          expect(part.recall).toBeLessThanOrEqual(full.recall);
          expect(noisy.recovered).toBeLessThanOrEqual(part.recovered);
          for (const s of [part, noisy]) {
            expect(s.recall).toBeGreaterThanOrEqual(0);
            expect(s.recall).toBeLessThanOrEqual(1);
            expect(s.recovered).toBeLessThanOrEqual(Math.min(s.known, s.inferred));
            if (s.precision !== null) expect(s.precision).toBeLessThanOrEqual(1);
          }
        },
      ),
    );
  });
});
