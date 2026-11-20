import { parseExpr } from '@afterlife/soul';
import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeToolUse } from '../llm/fake';
import { MemoryLlmCallLog } from '../llm/log';
import { CrewLlm } from '../llm/runtime';
import { effectsOf, hypothesesFor } from './hypotheses';
import { shifaEntities, shifaRun } from './testing/shifa-runs';
import {
  confidenceOf,
  countNodes,
  envFor,
  selectRule,
  targetOf,
  verifyCandidates,
  type RuleProbe,
} from './verify';

const ENTITIES = shifaEntities();
const small = shifaRun('bill-small');
const discount = shifaRun('bill-discount');
const exactly5000 = shifaRun('bill-5000');

describe('the Shifa runs (real DOSBox output)', () => {
  it('each scenario inserts its bill', () => {
    const bill = (o: typeof small) => o.dbfDiff.tables['BILLS.DBF']!.inserted[0]!.values;
    expect(bill(small)).toMatchObject({ SUBTOTAL: '87.50', DISCOUNT: '0.00', GST: '14.87' });
    expect(bill(discount)).toMatchObject({
      SUBTOTAL: '5200.00',
      DISCOUNT: '520.00',
      GST: '795.60',
    });
    expect(bill(exactly5000)).toMatchObject({
      SUBTOTAL: '5000.00',
      DISCOUNT: '0.00',
      GST: '850.00',
    });
  });
});

describe('countNodes', () => {
  it('counts every node of the tree', () => {
    expect(countNodes(parseExpr('0'))).toBe(1);
    expect(countNodes(parseExpr('bill.subtotal * 0.17'))).toBe(3);
    expect(countNodes(parseExpr('trunc((bill.subtotal - bill.discount) * 0.17, 2)'))).toBe(7);
    expect(
      countNodes(parseExpr('if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0')),
    ).toBe(10);
  });
});

describe('envFor', () => {
  const effects = effectsOf([small], ENTITIES);
  const gst = effects.find((e) => targetOf(e) === 'bill.gst')!;
  const stock = effects.find((e) => targetOf(e) === 'medicine.qty')!;

  it('gives the record without the value it is to explain, typed by the DBF fields', () => {
    const env = envFor(gst, small, ENTITIES) as { bill: Record<string, unknown> };
    expect(env.bill).not.toHaveProperty('gst');
    expect(String(env.bill.subtotal)).toBe('87.5');
  });

  it('a changed value is the value before, with the bill line that holds the medicine’s code', () => {
    const env = envFor(stock, small, ENTITIES) as Record<string, Record<string, unknown>>;
    expect(String(env.medicine!.qty)).toBe(stock.before);
    // A C field stays text (DslText), as the DBF type says.
    expect(env.bill_item!.code).toMatchObject({ text: stock.record.code });
    // The one bill of the same save is there too.
    expect(String(env.bill!.subtotal)).toBe('87.5');
  });

  it('today is the app’s date', () => {
    const env = envFor(gst, small, ENTITIES, { today: '1998-07-15 10:00:00' });
    expect(env.today).toMatchObject({ iso: '1998-07-15' });
  });
});

const GST = [
  'round((bill.subtotal - bill.discount) * 0.17, 2)',
  'trunc(bill.subtotal * 0.17, 2)',
  'floor((bill.subtotal - bill.discount) * 17) / 100',
  'trunc((bill.subtotal - bill.discount) * 0.17, 2)',
];
const DISCOUNT = [
  '0',
  'trunc(bill.subtotal * 0.10, 2)',
  'if bill.subtotal >= 5000 then trunc(bill.subtotal * 0.10, 2) else 0',
  'if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0',
  'if bill.subtotal > 5000 then round(bill.subtotal * 0.10, 2) else 0',
];

describe('verifyCandidates (Prompt 55 done when: Shifa’s truncated 17% GST and the 5000 threshold)', () => {
  const runs = [small, discount, exactly5000];

  it('finds the truncated 17% GST on the discounted total', () => {
    const v = verifyCandidates('bill.gst', GST, runs, ENTITIES);
    expect(v.effects).toBe(3);
    expect(v.selected?.expression).toBe('trunc((bill.subtotal - bill.discount) * 0.17, 2)');
    // Rounding gives 14.88 for 87.50 (14.875); the app wrote 14.87.
    const round = v.checks.find((c) => c.expression.startsWith('round'))!;
    expect(round.misses[0]).toMatchObject({
      observation: 'bill-small',
      expected: '14.87',
      got: '14.88',
    });
    // GST before the discount is wrong on the 5200 bill.
    expect(v.checks.find((c) => c.expression === GST[1])!.explained).toBe(2);
    // Whole paisa with floor fits too, but it is a bigger tree.
    expect(v.alsoFit).toEqual(['floor((bill.subtotal - bill.discount) * 17) / 100']);
    expect(v.selected!.evidence).toEqual(['bill-small', 'bill-discount', 'bill-5000']);
  });

  it('finds the 10% discount over 5000, and that exactly 5000 gets none', () => {
    const v = verifyCandidates('bill.discount', DISCOUNT, runs, ENTITIES);
    expect(v.selected?.expression).toBe(
      'if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0',
    );
    expect(v.checks.find((c) => c.expression === '0')!.explained).toBe(2);
    expect(v.checks.find((c) => c.expression.includes('>='))!.misses).toEqual([
      { observation: 'bill-5000', expected: '0.00', got: '500' },
    ]);
    // The threshold was seen below, on and above it: full coverage.
    expect(v.selected!.coverage).toBe(1);
    expect(v.selected!.confidence).toBe(confidenceOf(3, 1));
  });

  it('a candidate that does not parse is kept as a check that explains nothing', () => {
    const v = verifyCandidates('bill.gst', ['bill.gst := 17%', GST[3]!], runs, ENTITIES);
    expect(v.checks[0]).toMatchObject({ nodes: null, explained: 0 });
    expect(v.selected?.expression).toBe(GST[3]);
  });

  it('a value with no effects selects nothing', () => {
    const v = verifyCandidates('bill.tax_rate', ['0.17'], runs, ENTITIES);
    expect(v).toMatchObject({ effects: 0, selected: null });
  });

  it('the stock change is the bill line’s quantity off the stock', () => {
    const v = verifyCandidates(
      'medicine.qty',
      ['medicine.qty - 1', 'medicine.qty - bill_item.qty', 'medicine.qty + bill_item.qty'],
      runs,
      ENTITIES,
    );
    expect(v.effects).toBeGreaterThanOrEqual(4);
    expect(v.selected?.expression).toBe('medicine.qty - bill_item.qty');
  });
});

describe('probes', () => {
  it('without a bill of exactly 5000, it asks for one, and for 5001', () => {
    const v = verifyCandidates('bill.discount', DISCOUNT, [small, discount], ENTITIES);
    // > and >= both fit: the simplest-first order picks >=, but the threshold was never tried on it.
    expect(v.alsoFit.length).toBeGreaterThan(0);
    expect(v.probes).toEqual([
      {
        target: 'bill.discount',
        field: 'bill.subtotal',
        values: ['5000', '5001'],
        text: 'Try a bill subtotal of exactly 5000 and of 5001.',
      },
    ]);
    expect(v.selected!.coverage).toBeCloseTo(2 / 3, 2);
    expect(v.selected!.confidence).toBeLessThan(confidenceOf(2, 1));
  });

  it('nothing fits: it asks for the thresholds of every candidate', () => {
    const v = verifyCandidates(
      'bill.discount',
      ['if bill.subtotal > 6000 then 1 else 2', '3'],
      [small, discount],
      ENTITIES,
    );
    expect(v.selected).toBeNull();
    expect(v.probes.map((p) => p.values)).toEqual([['6000', '6001']]);
  });

  it('selectRule runs the probes in the old app and checks again, until one rule is left', async () => {
    const asked: RuleProbe[][] = [];
    const v = await selectRule('bill.discount', DISCOUNT, [small, discount], ENTITIES, {
      // The Possessor's probe: the scripted bill of exactly Rs 5,000, run in the real app.
      probe: async (probes) => {
        asked.push(probes);
        return [exactly5000];
      },
    });
    expect(asked).toHaveLength(1);
    expect(asked[0]![0]!.text).toBe('Try a bill subtotal of exactly 5000 and of 5001.');
    expect(v.rounds).toBe(1);
    expect(v.selected?.expression).toBe(
      'if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0',
    );
    expect(v.selected!.evidence).toContain('bill-5000');
  });

  it('a probe that brings nothing new stops the loop, and no runner returns the probes', async () => {
    let calls = 0;
    const v = await selectRule('bill.discount', DISCOUNT, [small, discount], ENTITIES, {
      probe: async () => {
        calls++;
        return [discount];
      },
    });
    expect(calls).toBe(1);
    expect(v.probes).toHaveLength(1);
    const none = await selectRule('bill.discount', DISCOUNT, [small, discount], ENTITIES);
    expect(none.rounds).toBe(0);
    expect(none.probes).toHaveLength(1);
  });
});

describe('confidenceOf', () => {
  it('grows with the evidence and the coverage, and stays within 0 to 1', () => {
    expect(confidenceOf(1, 1)).toBe(0.33);
    expect(confidenceOf(3, 1)).toBe(0.6);
    expect(confidenceOf(10, 1)).toBe(0.83);
    expect(confidenceOf(3, 0)).toBe(0.3);
    expect(confidenceOf(0, 1)).toBe(0);
  });
});

describe('with the model’s candidates (a fake LLM)', () => {
  it('hypotheses for bill.gst, verified on Shifa’s runs, select the truncated GST', async () => {
    const llm = new CrewLlm({
      client: new FakeLlmClient([
        fakeToolUse('answer', { candidates: GST.map((expression) => ({ expression, why: 'x' })) }),
      ]),
      log: new MemoryLlmCallLog(),
      projectId: 'p',
      budgetTokens: 1e6,
    });
    const effect = effectsOf([small], ENTITIES).find((e) => targetOf(e) === 'bill.gst')!;
    const h = await hypothesesFor(effect, [small], llm, ENTITIES);
    const v = verifyCandidates(
      h.target,
      h.candidates.map((c) => c.expression),
      [small, discount, exactly5000],
      ENTITIES,
    );
    expect(v.selected?.expression).toBe('trunc((bill.subtotal - bill.discount) * 0.17, 2)');
  });
});
