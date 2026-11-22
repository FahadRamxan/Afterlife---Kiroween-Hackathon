// @spec oracle-proof#3.2 A difference in one sentence (Prompt 69).
import type { SnapshotDiff, TableDiff } from '@afterlife/dbf';
import { SHIFA_REFERENCE_SOUL as SOUL } from '@afterlife/soul/examples/shifa';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { effectDifferences } from './compare';
import { explainDifference } from './explain';

const table = (t: Partial<TableDiff>): TableDiff => ({
  key: null,
  inserted: [],
  deleted: [],
  updated: [],
  schema: { added: [], removed: [] },
  ...t,
});
const effects = (bill: Record<string, string>, stock = '-400'): SnapshotDiff => ({
  tables: {
    'BILLS.DBF': table({
      key: 'BILL_NO',
      inserted: [{ key: bill.BILL_NO!, recno: 3, values: bill }],
    }),
    'MEDICINE.DBF': table({
      key: 'CODE',
      updated: [
        {
          key: 'PAN500',
          beforeRecno: 0,
          afterRecno: 0,
          changes: [
            { field: 'QTY', before: '500', after: String(500 + Number(stock)), delta: stock },
          ],
        },
      ],
    }),
  },
  unchanged: [],
  addedTables: [],
  removedTables: [],
});
const BILL = {
  BILL_NO: '9807-0001',
  SUBTOTAL: '5000.06',
  DISCOUNT: '500.00',
  GST: '850.00',
  TOTAL: '5350.06',
};
const CASE = {
  actionId: 'save-bill',
  inputs: { values: { CUST_ID: '' }, lines: [{ CODE: 'PAN500', QTY: '400' }] },
};
const explain = (old: SnapshotDiff, vessel: SnapshotDiff) =>
  explainDifference(SOUL, { ...CASE, old, vessel, differences: effectDifferences(old, vessel) });

describe('explainDifference', () => {
  it('says what the old app charged and what the new app charged, on which bill', () => {
    expect(explain(effects(BILL), effects({ ...BILL, GST: '850.01' }))).toBe(
      'Old app charged Rs 850.00 GST, new app charged Rs 850.01, on a bill of Rs 5000.06 (PAN500 x 400).',
    );
  });

  it('counts the other values that differ', () => {
    expect(explain(effects(BILL), effects({ ...BILL, GST: '850.01', TOTAL: '5350.07' }))).toBe(
      'Old app charged Rs 850.00 GST, new app charged Rs 850.01, on a bill of Rs 5000.06 (PAN500 x 400). 1 other value differs too.',
    );
  });

  it('names a stock that moved differently, by its record', () => {
    expect(explain(effects(BILL, '-400'), effects(BILL, '-399'))).toBe(
      'Old app set QTY of medicine PAN500 to 100, new app to 101, on a bill of Rs 5000.06 (PAN500 x 400).',
    );
  });

  it('says which side saved a record the other did not', () => {
    const none: SnapshotDiff = { tables: {}, unchanged: [], addedTables: [], removedTables: [] };
    expect(explain(none, effects(BILL))).toBe(
      'New app saved a bill of Rs 5000.06 (PAN500 x 400) the old app did not. 1 other value differs too.',
    );
    // A line only one side wrote names its own values.
    const line = (code: string): SnapshotDiff => ({
      ...effects(BILL),
      tables: {
        ...effects(BILL).tables,
        'BILLITEM.DBF': table({
          inserted: [{ key: null, recno: 0, values: { CODE: code, QTY: '1' } }],
        }),
      },
    });
    expect(explain(effects(BILL), line('COT001'))).toBe(
      'New app saved a bill line (CODE COT001, QTY 1) the old app did not, on a bill of Rs 5000.06 (PAN500 x 400).',
    );
  });

  it('is always one sentence naming both values (invariant)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 99_999 }),
        fc.integer({ min: 1, max: 99_999 }),
        (a, b) => {
          fc.pre(a !== b);
          const rs = (n: number) => (n / 100).toFixed(2);
          const s = explain(effects({ ...BILL, GST: rs(a) }), effects({ ...BILL, GST: rs(b) }));
          expect(s).toContain(`Rs ${rs(a)}`);
          expect(s).toContain(`Rs ${rs(b)}`);
          expect(s.match(/\.( |$)/g)).toHaveLength(1);
        },
      ),
    );
  });
});
