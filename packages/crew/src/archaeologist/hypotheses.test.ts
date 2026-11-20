import { parseExpr } from '@afterlife/soul';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeToolUse } from '../llm/fake';
import { MemoryLlmCallLog } from '../llm/log';
import { CrewLlm, LlmSchemaError } from '../llm/runtime';
import type { LlmRequest, ToolResultBlock } from '../llm/types';
import {
  HYPOTHESES_TEMPLATE,
  effectsOf,
  hypothesesFor,
  promptFor,
  renderTemplate,
  type EffectObservation,
} from './hypotheses';

const ENTITIES = [
  { id: 'bill', file: 'BILLS.DBF' },
  { id: 'medicine', file: 'MEDICINE.DBF' },
];

/** Saving Shifa's bill for 8 x INS100 (5200.00, over 5000): a discount, GST and a stock change. */
const saved: EffectObservation = {
  id: 'obs-1',
  keys: '{F2}',
  screenBefore: {
    model: {
      title: { name: 'NEW BILL' },
      fields: [],
      labels: [
        { label: 'SUBTOTAL', value: '5200.00' },
        { label: 'DISCOUNT 10%', value: '520.00' },
      ],
    },
  },
  dbfDiff: {
    tables: {
      'BILLS.DBF': {
        key: 'BILL_NO',
        inserted: [
          {
            key: '9807-0001',
            recno: 3,
            values: {
              BILL_NO: '9807-0001',
              BILL_DATE: '19980715',
              CUST_ID: 'C0002',
              SUBTOTAL: '5200.00',
              DISCOUNT: '520.00',
              GST: '795.60',
              TOTAL: '5475.60',
            },
          },
        ],
        deleted: [],
        updated: [],
        schema: { added: [], removed: [] },
      },
      'MEDICINE.DBF': {
        key: 'CODE',
        inserted: [],
        deleted: [],
        updated: [
          {
            key: 'INS100',
            beforeRecno: 8,
            afterRecno: 8,
            changes: [{ field: 'QTY', before: '12', after: '4', delta: '-8' }],
          },
        ],
        schema: { added: [], removed: [] },
      },
    },
    unchanged: [],
    addedTables: [],
    removedTables: [],
  },
};

describe('effectsOf', () => {
  it('each number an action wrote: an inserted record’s numbers, and each changed number with its delta', () => {
    const effects = effectsOf([saved], ENTITIES);
    expect(
      effects.map(
        (e) => `${e.entity}.${e.field} ${e.kind} ${e.after}${e.delta ? ` (${e.delta})` : ''}`,
      ),
    ).toEqual([
      'bill.subtotal inserted 5200.00',
      'bill.discount inserted 520.00',
      'bill.gst inserted 795.60',
      'bill.total inserted 5475.60',
      'medicine.qty changed 4 (-8)',
    ]);
    expect(effects.every((e) => e.observation === 'obs-1')).toBe(true);
  });

  it('a number that is the same in every effect of the same field is still one effect per observation', () => {
    expect(effectsOf([saved, { ...saved, id: 'obs-2' }], ENTITIES)).toHaveLength(10);
  });
});

describe('the prompt template (packages/crew/prompts/rule-hypotheses.md)', () => {
  it('has a system and a user part, and every placeholder is filled', () => {
    expect(HYPOTHESES_TEMPLATE.system).toMatch(
      /Propose \{\{min\}\} to \{\{max\}\} candidate rules/,
    );
    const [gst] = effectsOf([saved], ENTITIES).filter((e) => e.field === 'gst');
    const p = promptFor(gst!, [saved]);
    for (const s of [p.system, p.user]) expect(s).not.toMatch(/\{\{|\}\}/);
    expect(p.system).toContain('Propose 3 to 5 candidate rules');
    expect(p.user).toContain('Effect: bill.gst (BILLS.DBF, inserted)');
    expect(p.user).toContain('subtotal = 5200.00');
    expect(p.user).toContain('discount = 520.00');
    expect(p.user).toContain('DISCOUNT 10%: 520.00');
    expect(p.user).toContain('NEW BILL');
    // The other records the same action wrote, for rules that span tables.
    expect(p.user).toContain('medicine.qty: 12 -> 4');
  });

  it('for a changed value, the field means its value before the change', () => {
    const [stock] = effectsOf([saved], ENTITIES).filter((e) => e.field === 'qty');
    const p = promptFor(stock!, [saved], ENTITIES);
    expect(p.user).toContain(
      'It changed from 12 to 4 (-8). In a rule, medicine.qty is its value before the change.',
    );
  });

  it('renderTemplate fills every placeholder it is given and refuses a missing one', () => {
    expect(renderTemplate('a {{x}} b {{y}}', { x: '1', y: '2' })).toBe('a 1 b 2');
    expect(() => renderTemplate('a {{x}}', {})).toThrow(/x/);
  });
});

describe('hypothesesFor (Prompt 54 done when: schema-validated, with a fake LLM)', () => {
  const llmWith = (client: FakeLlmClient) =>
    new CrewLlm({ client, log: new MemoryLlmCallLog(), projectId: 'p', budgetTokens: 1e6 });
  const [gst] = effectsOf([saved], ENTITIES).filter((e) => e.field === 'gst');

  it('returns 3 to 5 candidate rules for the effect, each a valid expression', async () => {
    const client = new FakeLlmClient([
      fakeToolUse('answer', {
        candidates: [
          {
            expression: 'trunc((bill.subtotal - bill.discount) * 0.17, 2)',
            why: 'GST on the discounted total, truncated',
          },
          {
            expression: 'round((bill.subtotal - bill.discount) * 0.17, 2)',
            why: 'the same, rounded',
          },
          { expression: 'trunc(bill.subtotal * 0.17, 2)', why: 'GST before the discount' },
          {
            expression: 'floor((bill.subtotal - bill.discount) * 17) / 100',
            why: 'in whole paisa',
          },
        ],
      }),
    ]);
    const h = await hypothesesFor(gst!, [saved], llmWith(client));
    expect(h.target).toBe('bill.gst');
    expect(h.candidates.map((c) => c.expression)).toHaveLength(4);
    for (const c of h.candidates) expect(() => parseExpr(c.expression)).not.toThrow();
    // The fields it may use were given; the model was asked for 3 to 5.
    const sent = client.requests[0]!;
    expect(sent.system).toContain('Propose 3 to 5 candidate rules');
  });

  it('a candidate that is not a valid expression is refused and the model asked again', async () => {
    const client = new FakeLlmClient([
      fakeToolUse('answer', {
        candidates: [
          { expression: 'trunc((bill.subtotal - bill.discount) * 0.17, 2)', why: 'a' },
          { expression: 'bill.gst := subtotal * 17%', why: 'not our language' },
          { expression: 'round(bill.subtotal * 0.17, 2)', why: 'c' },
        ],
      }),
      fakeToolUse('answer', {
        candidates: [
          { expression: 'trunc((bill.subtotal - bill.discount) * 0.17, 2)', why: 'a' },
          { expression: 'trunc(bill.subtotal * 0.17, 2)', why: 'b' },
          { expression: 'round(bill.subtotal * 0.17, 2)', why: 'c' },
        ],
      }),
    ]);
    const h = await hypothesesFor(gst!, [saved], llmWith(client));
    expect(h.candidates).toHaveLength(3);
    const back = client.requests[1]!.messages[2]!.content[0] as ToolResultBlock;
    expect(String(back.content)).toMatch(/candidates\.1\.expression/);
  });

  it('a changed value’s rule may use the field itself (its value before)', async () => {
    const [stock] = effectsOf([saved], ENTITIES).filter((e) => e.field === 'qty');
    const client = new FakeLlmClient([
      fakeToolUse('answer', {
        candidates: [
          { expression: 'medicine.qty - 8', why: 'a' },
          { expression: 'medicine.qty - 4', why: 'b' },
          { expression: 'medicine.qty / 3', why: 'c' },
        ],
      }),
    ]);
    const h = await hypothesesFor(stock!, [saved], llmWith(client), ENTITIES);
    expect(h.target).toBe('medicine.qty');
    expect(h.candidates).toHaveLength(3);
  });

  it('fewer than 3, more than 5, a repeated one, or a field it was not shown are refused', async () => {
    const answer = (exprs: string[]) =>
      fakeToolUse('answer', { candidates: exprs.map((expression) => ({ expression, why: 'x' })) });
    const refuse = async (exprs: string[]) => {
      const client = new FakeLlmClient(() => answer(exprs));
      return hypothesesFor(gst!, [saved], llmWith(client)).catch((e: unknown) => e);
    };
    expect(await refuse(['1', '2'])).toBeInstanceOf(LlmSchemaError);
    expect(await refuse(['1', '2', '3', '4', '5', '6'])).toBeInstanceOf(LlmSchemaError);
    expect(await refuse(['bill.subtotal', 'bill.subtotal', '1'])).toBeInstanceOf(LlmSchemaError);
    const unknown = await refuse(['bill.subtotal', 'bill.tax_rate * 2', '1']);
    expect((unknown as LlmSchemaError).issues.join(' ')).toMatch(/bill\.tax_rate/);
  });

  it('every accepted candidate parses and uses only the fields shown (invariant)', async () => {
    const pieces = fc.constantFrom(
      'bill.subtotal',
      'bill.discount',
      'bill.tax_rate',
      '0.17',
      '5000',
      'medicine.qty',
      'x +',
      ')',
    );
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.array(pieces, { minLength: 1, maxLength: 4 }).map((p) => p.join(' ')),
          { minLength: 3, maxLength: 5 },
        ),
        async (exprs) => {
          const client = new FakeLlmClient((req: LlmRequest) => {
            void req;
            return fakeToolUse('answer', {
              candidates: exprs.map((expression) => ({ expression, why: 'x' })),
            });
          });
          const h = await hypothesesFor(gst!, [saved], llmWith(client)).catch(() => null);
          if (!h) return;
          for (const c of h.candidates) {
            expect(() => parseExpr(c.expression)).not.toThrow();
            // Only fields it was shown: the bill, and the medicine the same save changed.
            expect(c.expression).not.toMatch(/tax_rate/);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
