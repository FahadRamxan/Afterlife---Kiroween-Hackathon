// @spec archaeologist-completion#2 Rules without a model.
// @spec archaeologist-completion#2.1 The enumerator and its tests.
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { enumerateCandidates } from './enumerate';
import { inferRules } from './infer';
import { effectsOf } from './hypotheses';
import { graveyardRun, readCsv } from './testing/graveyard-runs';
import { envFor, targetOf, verifyCandidates } from './verify';

const ENTITIES = SHIFA_REFERENCE_SOUL.entities;
const KEYS = { BILLS: 'BILL_NO', BILLITEM: null, MEDICINE: 'CODE', CUSTOMER: 'CUST_ID' };
const run = (s: string) => graveyardRun('shifa', s, KEYS);
const TABLES = Object.fromEntries(
  ['MEDICINE', 'CUSTOMER', 'BILLS', 'BILLITEM'].map((f) => [
    `${f}.DBF`,
    readCsv(`shifa/seed/${f}.csv`).records,
  ]),
);
const OPTS = { today: '1998-07-15', tables: TABLES };

/** What the enumerator and the verifier find for a value, with no model. */
function find(target: string, runs: ReturnType<typeof run>[]) {
  const effects = effectsOf(runs, ENTITIES).filter((e) => targetOf(e) === target);
  const candidates = enumerateCandidates(effects, runs, ENTITIES, OPTS);
  return verifyCandidates(target, candidates, runs, ENTITIES, OPTS);
}

// Shifa's scripted bills, as the real app saved them in DOSBox: under 5,000, over it, exactly it.
const RUNS = ['bill-small', 'bill-discount', 'bill-5000'].map(run);

describe('rules without a model, on Shifa’s real runs', () => {
  it.each([
    ['bill.gst', 'trunc((bill.subtotal - bill.discount) * 0.17, 2)'],
    ['bill.discount', 'if bill.subtotal > 5000 then trunc(bill.subtotal * 0.1, 2) else 0'],
    ['bill.total', 'bill.subtotal - bill.discount + bill.gst'],
    ['bill.subtotal', 'sum(items, x => x.amount)'],
    ['bill_item.amount', 'bill_item.qty * bill_item.price'],
    ['bill_item.price', 'medicine.price'],
    ['medicine.qty', 'medicine.qty - bill_item.qty'],
    ['bill.bill_date', 'today'],
  ])('%s is found: %s', async (target, expected) => {
    const r = await inferRules(null, ENTITIES, RUNS, OPTS);
    expect(r.rules.find((x) => x.target === target)?.expression).toBe(expected);
  });

  it('chooses in layers: no rule uses a value whose rule comes after it', async () => {
    const r = await inferRules(null, ENTITIES, RUNS, OPTS);
    const targets = r.rules.map((x) => x.target!);
    expect(targets.length).toBe(8);
    r.rules.forEach((rule, i) => {
      const uses = targets.filter((t) => t !== rule.target && rule.expression.includes(t));
      for (const u of uses) expect(targets.indexOf(u), `${rule.target} uses ${u}`).toBeLessThan(i);
    });
  });

  it('one bill under 5,000 gives no discount rule (0 on one bill says little), and it asks for bigger bills', async () => {
    const r = await inferRules(null, ENTITIES, [run('bill-small')], OPTS);
    expect(r.rules.find((x) => x.target === 'bill.discount')).toBeUndefined();
    // Nor a total: subtotal + gst and subtotal - discount + gst both fit one bill with no discount.
    expect(r.rules.find((x) => x.target === 'bill.total')).toBeUndefined();
    expect(r.unexplained).toContain('bill.total');
    expect(r.probes).toContainEqual(
      expect.objectContaining({
        target: 'bill.discount',
        field: 'bill.subtotal',
        values: ['1000', '5000', '10000'],
      }),
    );
  });

  it('probes the old app for bigger bills until the rules settle, asking each value once', async () => {
    // @spec archaeologist-completion#3.2
    // The old app, as far as the test goes: a probe for a subtotal gives the smallest bill of the
    // recorded ones at or over it (5000.00, 5200.00), each once; nothing for a bigger one.
    const later = [run('bill-5000'), run('bill-discount')];
    const subtotal = (o: ReturnType<typeof run>) =>
      Number(Object.values(o.dbfDiff.tables['BILLS.DBF']!.inserted)[0]!.values.SUBTOTAL);
    const asked: string[] = [];
    const r = await inferRules(null, ENTITIES, [run('bill-small')], {
      ...OPTS,
      maxRounds: 6,
      probe: async (probes) => {
        const out: ReturnType<typeof run>[] = [];
        for (const p of probes)
          for (const v of p.values) {
            asked.push(`${p.field}=${v}`);
            const i = later.findIndex((o) => subtotal(o) >= Number(v));
            if (i >= 0) out.push(...later.splice(i, 1));
          }
        return out;
      },
    });
    expect(asked.length).toBeGreaterThan(0);
    expect(new Set(asked).size).toBe(asked.length);
    for (const a of asked) expect(Number(a.split('=')[1])).toBeGreaterThan(0);
    const rule = (target: string) => r.rules.find((x) => x.target === target)?.expression;
    expect(rule('bill.discount')).toBe(
      'if bill.subtotal > 5000 then trunc(bill.subtotal * 0.1, 2) else 0',
    );
    expect(rule('bill.gst')).toBe('trunc((bill.subtotal - bill.discount) * 0.17, 2)');
    expect(rule('bill.total')).toBe('bill.subtotal - bill.discount + bill.gst');
    expect(r.added).toHaveLength(2);
  });
  it('lines are the records that link to the bill, and a line sees the medicine it names', () => {
    const r = run('bill-small');
    const [gst] = effectsOf([r], ENTITIES).filter((e) => targetOf(e) === 'bill.gst');
    const env = envFor(gst!, r, ENTITIES, OPTS) as { items: unknown[] };
    expect(env.items).toHaveLength(2);
    const [price] = effectsOf([r], ENTITIES).filter((e) => targetOf(e) === 'bill_item.price');
    const lineEnv = envFor(price!, r, ENTITIES, OPTS) as Record<string, Record<string, unknown>>;
    // Looked up in the app's own data: the bill line's medicine is PAN500, at 12.50.
    expect(String(lineEnv.medicine!.price)).toBe('12.5');
  });
});

/** One saved bill with these values, after these keys. */
const bill = (i: number, values: Record<string, string>, keys = '{F2}') => ({
  id: `o${i}`,
  keys,
  screenBefore: {},
  dbfDiff: {
    tables: {
      'BILLS.DBF': {
        key: 'BILL_NO',
        inserted: [
          { key: `9807-000${i}`, recno: 10 + i, values: { BILL_NO: `9807-000${i}`, ...values } },
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
const candidates = (target: string, runs: ReturnType<typeof bill>[]) =>
  enumerateCandidates(
    effectsOf(runs, ENTITIES).filter((e) => targetOf(e) === target),
    runs,
    ENTITIES,
    OPTS,
  );

describe('enumerateCandidates: what one observation is evidence of', () => {
  it('a ratio from one bill only if it is shorter than the value it gives', () => {
    // 14.87 of 87.50 is 17% (2 digits for 4): a candidate. 1400 of 1 is 1400 (no shorter): not.
    expect(candidates('bill.gst', [bill(1, { SUBTOTAL: '87.50', GST: '14.87' })])).toContain(
      'trunc(bill.subtotal * 0.17, 2)',
    );
    const one = candidates('bill.gst', [bill(1, { SUBTOTAL: '1.00', GST: '1400.00' })]);
    expect(one.filter((c) => c.includes('1400'))).toEqual([]);
    // Two bills that agree on it are evidence.
    const two = candidates('bill.gst', [
      bill(1, { SUBTOTAL: '1.00', GST: '1400.00' }),
      bill(2, { SUBTOTAL: '2.00', GST: '2800.00' }),
    ]);
    expect(two).toContain('trunc(bill.subtotal * 1400, 2)');
  });

  it('a constant needs two observations, and is never a value the Possessor typed', () => {
    expect(candidates('bill.discount', [bill(1, { DISCOUNT: '0.00' })])).not.toContain('0');
    const agreed = [bill(1, { DISCOUNT: '100.00' }), bill(2, { DISCOUNT: '100.00' })];
    expect(candidates('bill.discount', agreed)).toContain('100');
    // 100.00 typed on each bill: the input, not a rule.
    const typedIn = [
      bill(1, { DISCOUNT: '100.00' }, '100.00{Enter}'),
      bill(2, { DISCOUNT: '100.00' }, '{F2}'),
    ];
    expect(candidates('bill.discount', typedIn)).not.toContain('100');
  });
});

describe('enumerateCandidates (properties)', () => {
  it('a hidden rate on any bills is found exactly, or a rule that gives the same on all of them (invariant)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('0.05', '0.1', '0.15', '0.17', '0.2'),
        fc.array(fc.integer({ min: 100, max: 2_000_000 }), { minLength: 2, maxLength: 6 }),
        (rate, paisa) => {
          const runs = paisa.map((p, i) => {
            const subtotal = (p / 100).toFixed(2);
            const discount = '0.00';
            const gst = (Math.floor(p * Number(rate)) / 100).toFixed(2);
            return {
              id: `o${i}`,
              keys: '{F2}',
              screenBefore: {},
              dbfDiff: {
                tables: {
                  'BILLS.DBF': {
                    key: 'BILL_NO',
                    inserted: [
                      {
                        key: `9807-000${i}`,
                        recno: 10 + i,
                        values: {
                          BILL_NO: `9807-000${i}`,
                          SUBTOTAL: subtotal,
                          DISCOUNT: discount,
                          GST: gst,
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
            };
          });
          const v = find('bill.gst', runs);
          expect(v.selected).not.toBeNull();
          // Whatever it chose gives the old app's GST on every bill.
          expect(v.checks.find((c) => c.expression === v.selected!.expression)!.explained).toBe(
            runs.length,
          );
        },
      ),
    );
  });
});
