// Prompt 55 done when: a selected rule reproduces every recorded observation. Bills are made up
// by a hidden rule; the candidates are that rule among look-alikes (other roundings, thresholds
// and rates). Whatever is selected must give, on every observation, the value that was recorded.
import { evaluate, parseExpr } from '@afterlife/soul';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { effectsOf, type EffectObservation } from './hypotheses';
import { countNodes, envFor, targetOf, verifyCandidates } from './verify';

const ENTITIES = [
  {
    id: 'bill',
    file: 'BILLS.DBF',
    key: ['BILL_NO'],
    fields: [
      { name: 'BILL_NO', type: 'C' as const, length: 9, decimals: 0 },
      { name: 'SUBTOTAL', type: 'N' as const, length: 11, decimals: 2 },
      { name: 'DISCOUNT', type: 'N' as const, length: 10, decimals: 2 },
    ],
  },
];

const RULES = [
  'trunc(bill.subtotal * 0.10, 2)',
  'round(bill.subtotal * 0.10, 2)',
  'if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0',
  'if bill.subtotal >= 5000 then trunc(bill.subtotal * 0.10, 2) else 0',
  'if bill.subtotal > 5000 then round(bill.subtotal * 0.10, 2) else 0',
  'trunc(bill.subtotal * 0.05, 2)',
  '0',
];

/** The value a rule gives a bill, as the old app would have written it (2 places). */
const apply = (rule: string, subtotal: string) =>
  new Decimal(
    String(evaluate(parseExpr(rule), { bill: { subtotal: new Decimal(subtotal) } })),
  ).toFixed(2);

const bill = (i: number, subtotal: string, discount: string): EffectObservation => ({
  id: `obs-${i}`,
  keys: '{F2}',
  screenBefore: {},
  dbfDiff: {
    tables: {
      'BILLS.DBF': {
        key: 'BILL_NO',
        inserted: [
          {
            key: `9807-${String(i + 1).padStart(4, '0')}`,
            recno: i + 1,
            values: {
              BILL_NO: `9807-${String(i + 1).padStart(4, '0')}`,
              SUBTOTAL: subtotal,
              DISCOUNT: discount,
            },
          },
        ],
        deleted: [],
        updated: [],
        schema: { added: [], removed: [] },
      },
    },
    unchanged: [],
    addedTables: [],
    removedTables: [],
  },
});

// Paisa amounts, biased to the threshold.
const paisa = fc.oneof(
  fc.integer({ min: 0, max: 2_000_000 }),
  fc.integer({ min: 499_900, max: 500_100 }),
  fc.constant(500_000),
);
const amount = (p: number) => new Decimal(p).div(100).toFixed(2);

describe('verifyCandidates (property)', () => {
  it('a selected rule reproduces every recorded observation, and is never bigger than the truth', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RULES),
        fc.array(paisa, { minLength: 1, maxLength: 12 }),
        fc.shuffledSubarray(RULES, { minLength: 0 }),
        (hidden, subtotals, others) => {
          const observations = subtotals.map((p, i) =>
            bill(i, amount(p), apply(hidden, amount(p))),
          );
          const candidates = [...new Set([...others, hidden])];
          const v = verifyCandidates('bill.discount', candidates, observations, ENTITIES);
          // The truth always explains its own data, so something is selected.
          expect(v.selected).not.toBeNull();
          expect(v.selected!.nodes).toBeLessThanOrEqual(countNodes(parseExpr(hidden)));
          const ast = parseExpr(v.selected!.expression);
          const byId = new Map(observations.map((o) => [o.id, o]));
          for (const e of effectsOf(observations, ENTITIES).filter(
            (x) => targetOf(x) === 'bill.discount',
          )) {
            const got = evaluate(ast, envFor(e, byId.get(e.observation)!, ENTITIES));
            expect(new Decimal(String(got)).eq(new Decimal(e.after))).toBe(true);
          }
          expect(v.selected!.confidence).toBeGreaterThanOrEqual(0);
          expect(v.selected!.confidence).toBeLessThanOrEqual(1);
        },
      ),
    );
  });

  it('is deterministic: the same input gives the same answer (invariant)', () => {
    fc.assert(
      fc.property(fc.array(paisa, { minLength: 1, maxLength: 8 }), (subtotals) => {
        const observations = subtotals.map((p, i) =>
          bill(i, amount(p), apply(RULES[2]!, amount(p))),
        );
        expect(verifyCandidates('bill.discount', RULES, observations, ENTITIES)).toEqual(
          verifyCandidates('bill.discount', RULES, observations, ENTITIES),
        );
      }),
    );
  });
});
