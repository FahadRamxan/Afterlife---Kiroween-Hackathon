// @spec oracle-proof#2 Comparing the two sides' effects (Prompt 68).
import type { SnapshotDiff, TableDiff } from '@afterlife/dbf';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { effectDifferences, normalValue, sameEffects } from './compare';

const table = (t: Partial<TableDiff>): TableDiff => ({
  key: null,
  inserted: [],
  deleted: [],
  updated: [],
  schema: { added: [], removed: [] },
  ...t,
});
const diff = (tables: Record<string, TableDiff>, unchanged: string[] = []): SnapshotDiff => ({
  tables,
  unchanged,
  addedTables: [],
  removedTables: [],
});
const bill = (values: Record<string, string>) =>
  diff({
    'BILLS.DBF': table({
      key: 'BILL_NO',
      inserted: [{ key: values.BILL_NO!, recno: 3, values }],
    }),
    'MEDICINE.DBF': table({
      key: 'CODE',
      updated: [
        {
          key: 'PAN500',
          beforeRecno: 0,
          afterRecno: 0,
          changes: [{ field: 'QTY', before: '120', after: '118', delta: '-2' }],
        },
      ],
    }),
  });
const BILL = { BILL_NO: '9807-0001', SUBTOTAL: '5000.00', GST: '850.00', CUST_ID: '' };

describe('normalValue', () => {
  it('compares numbers as numbers and text without its padding', () => {
    expect(normalValue('5000.00')).toBe(normalValue('5000'));
    expect(normalValue(' 0042')).toBe('42');
    expect(normalValue('PANADOL   ')).toBe('PANADOL');
    expect(normalValue(null)).toBe('');
    expect(normalValue(true)).toBe('T');
  });
});

describe('effectDifferences', () => {
  it('the same effects agree, padding and trailing zeros aside', () => {
    expect(sameEffects(bill(BILL), bill({ ...BILL, SUBTOTAL: '5000', CUST_ID: '     ' }))).toBe(
      true,
    );
  });

  it('a value that differs on a new record names the table, the record and both values', () => {
    expect(effectDifferences(bill(BILL), bill({ ...BILL, GST: '850.01' }))).toEqual([
      {
        table: 'BILLS.DBF',
        kind: 'inserted',
        record: 'BILL_NO 9807-0001',
        field: 'GST',
        old: '850',
        vessel: '850.01',
      },
    ]);
  });

  it('a record only one side wrote, and an update only one side made, are differences', () => {
    const none = diff({});
    expect(effectDifferences(bill(BILL), none)).toEqual([
      {
        table: 'BILLS.DBF',
        kind: 'inserted',
        record: 'BILL_NO 9807-0001',
        old: 'written',
        vessel: null,
        values: { BILL_NO: '9807-0001', SUBTOTAL: '5000', GST: '850' },
      },
      {
        table: 'MEDICINE.DBF',
        kind: 'updated',
        record: 'CODE PAN500',
        field: 'QTY',
        old: '118',
        vessel: '120',
      },
    ]);
    expect(effectDifferences(none, bill(BILL))[0]).toMatchObject({ old: null, vessel: 'written' });
  });

  it('a table neither side changed does not count (an unchanged file, an empty diff)', () => {
    const a = bill(BILL);
    const b = { ...bill(BILL), unchanged: ['CUSTOMER.DBF'] };
    b.tables['CUSTOMER.DBF'] = table({});
    expect(sameEffects(a, b)).toBe(true);
  });

  it('a deletion is placed by record number', () => {
    const del = (recno: number) =>
      diff({ 'X.DBF': table({ deleted: [{ key: null, recno, values: { A: '1' } }] }) });
    expect(sameEffects(del(4), del(4))).toBe(true);
    expect(effectDifferences(del(4), del(5))).toHaveLength(2);
  });

  it('any one value changed on either side is caught, and only that one (invariant)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('SUBTOTAL', 'GST', 'CUST_ID'),
        fc.stringMatching(/^[A-Z0-9]{1,8}$/),
        fc.boolean(),
        (field, value, onOld) => {
          fc.pre(normalValue(value) !== normalValue(BILL[field as keyof typeof BILL]));
          const changed = bill({ ...BILL, [field]: value });
          const d = onOld
            ? effectDifferences(changed, bill(BILL))
            : effectDifferences(bill(BILL), changed);
          expect(d).toHaveLength(1);
          expect(d[0]).toMatchObject({ table: 'BILLS.DBF', field });
        },
      ),
    );
  });

  it('effects always agree with themselves (invariant)', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.stringMatching(/^[A-Z]{1,6}$/),
          fc.oneof(fc.stringMatching(/^[A-Z ]{0,6}$/), fc.integer().map(String), fc.constant(null)),
        ),
        (values) => {
          const d = diff({ 'T.DBF': table({ inserted: [{ key: null, recno: 0, values }] }) });
          expect(sameEffects(d, structuredClone(d))).toBe(true);
        },
      ),
    );
  });
});
