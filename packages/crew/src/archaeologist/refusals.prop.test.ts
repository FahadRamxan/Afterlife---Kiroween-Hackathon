// @spec learned-certificates#1.1 Property: a refusal rule that is kept agrees with every attempt.
import fc from 'fast-check';
import Decimal from 'decimal.js';
import type { Entity } from '@afterlife/soul';
import { describe, expect, it } from 'vitest';
import { inferRefusals, type LineAttempt } from './refusals';
const ENTITIES = [
  {
    id: 'bill-item',
    file: 'BILLITEM.DBF',
    key: [],
    fields: [{ name: 'QTY', type: 'N', length: 5, decimals: 0 }],
    foreignKeys: [],
    counters: [],
  },
  {
    id: 'medicine',
    file: 'MEDICINE.DBF',
    key: ['CODE'],
    fields: [
      { name: 'QTY', type: 'N', length: 5, decimals: 0 },
      { name: 'PRICE', type: 'N', length: 8, decimals: 2 },
    ],
    foreignKeys: [],
    counters: [],
  },
] as unknown as Entity[];
const compare = (op: string, a: Decimal, b: Decimal) =>
  op === '<=' ? a.lte(b) : op === '<' ? a.lt(b) : true;
describe('inferRefusals (property)', () => {
  it('any hidden rule, any attempts: every rule kept is true of the taken and false of the refused', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('<=', '<', 'none'),
        fc.array(
          fc.record({
            value: fc.integer({ min: 0, max: 50 }),
            qty: fc.integer({ min: 0, max: 50 }),
            price: fc.integer({ min: 1, max: 50 }),
          }),
          { maxLength: 12 },
        ),
        (op, rows) => {
          const attempts: LineAttempt[] = rows.map((r, i) => ({
            action: 'save-bill',
            entity: 'bill-item',
            field: 'QTY',
            value: String(r.value),
            linkedEntity: 'medicine',
            linked: { values: { QTY: String(r.qty), PRICE: String(r.price) } },
            accepted: compare(op, new Decimal(r.value), new Decimal(r.qty)),
            observation: `o${i}`,
          }));
          for (const rule of inferRefusals(attempts, { entities: ENTITIES, actions: [] }).rules) {
            const [, rop, field] = /^bill_item\.qty (<=|<) medicine\.(\w+)$/.exec(rule.expression)!;
            for (const a of attempts) {
              const holds = compare(
                rop!,
                new Decimal(a.value),
                new Decimal(String(a.linked!.values[field!.toUpperCase()])),
              );
              expect(holds).toBe(a.accepted);
            }
          }
        },
      ),
    );
  });
});
