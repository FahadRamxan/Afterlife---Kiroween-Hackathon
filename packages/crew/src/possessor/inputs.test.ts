import { describe, expect, it } from 'vitest';
import type { FieldInfo } from './actions';
import { fitsType, probes, screenDate, typeField, typicalValue } from './inputs';
import type { DataSample } from './values';

const f = (label: string, length: number | null): FieldInfo => ({
  label,
  length,
  row: 21,
  col: 7,
  kind: 'reverse',
});

/** The first records of Shifa's and Barkat's data files, as readSamples gives them. */
const SHIFA: DataSample[] = [
  {
    file: 'MEDICINE.DBF',
    fields: [
      { name: 'CODE', type: 'C', length: 6 },
      { name: 'EXPIRY', type: 'D', length: 8 },
      { name: 'QTY', type: 'N', length: 5 },
    ],
    records: [
      { CODE: 'PAN500', EXPIRY: '19991231', QTY: '240' },
      { CODE: 'BRU400', EXPIRY: '19990630', QTY: '180' },
    ],
  },
  {
    file: 'CUSTOMER.DBF',
    fields: [
      { name: 'CUST_ID', type: 'C', length: 5 },
      { name: 'NAME', type: 'C', length: 25 },
    ],
    records: [{ CUST_ID: 'C0001', NAME: 'MRS. RUBINA' }],
  },
];
const BARKAT: DataSample[] = [
  {
    file: 'LEDGER.DBF',
    fields: [
      { name: 'PARTY_ID', type: 'C', length: 4 },
      { name: 'AMOUNT', type: 'N', length: 10 },
    ],
    records: [{ PARTY_ID: 'P001', AMOUNT: '75000.00' }],
  },
];

describe('typeField', () => {
  it('reads a type from the label, the width on screen, and the data files', () => {
    expect(typeField(f('Code', 6), SHIFA)).toMatchObject({
      type: { kind: 'code' },
      width: 6,
      dbf: { file: 'MEDICINE.DBF', name: 'CODE' },
      existing: ['PAN500', 'BRU400'],
    });
    expect(typeField(f('Qty', 4), SHIFA).type).toEqual({ kind: 'quantity' });
    expect(typeField(f('Customer ID (blank = walk-in)', 5), SHIFA)).toMatchObject({
      type: { kind: 'code' },
      dbf: { name: 'CUST_ID' },
      blankOk: true,
    });
    expect(typeField(f('Amount Rs', 9), BARKAT).type).toEqual({ kind: 'money', decimals: 2 });
    expect(typeField(f('Fee month (MMYYYY)', 6), []).type).toEqual({
      kind: 'month',
      format: 'MMYYYY',
    });
    expect(typeField(f('Expiry', 8), SHIFA).type).toEqual({ kind: 'date', format: 'DD/MM/YY' });
    expect(typeField(f('Phone', 12), SHIFA).type).toEqual({ kind: 'phone' });
    expect(typeField(f('Note', 20), BARKAT).type).toEqual({ kind: 'text' });
  });

  it('a prompt without a width on screen takes the data field width', () => {
    expect(typeField(f('Party ID', null), BARKAT).width).toBe(4);
  });
});

describe('typicalValue', () => {
  it('gets through the screen: a real code, a quantity of 1, a small amount, the app date', () => {
    const today = { y: 1998, m: 7, d: 15 };
    expect(typicalValue(typeField(f('Code', 6), SHIFA), today)).toBe('PAN500');
    expect(typicalValue(typeField(f('Qty', 4), SHIFA), today)).toBe('1');
    expect(typicalValue(typeField(f('Customer ID (blank = walk-in)', 5), SHIFA), today)).toBe('');
    // Not an amount from the data: Barkat's first one is over its credit limit.
    expect(typicalValue(typeField(f('Amount Rs', 9), BARKAT), today)).toBe('100.00');
    expect(typicalValue(typeField(f('Fee month (MMYYYY)', 6), []), { y: 2001, m: 3, d: 12 })).toBe(
      '032001',
    );
  });
});

describe('probes', () => {
  const at = { y: 1998, m: 7, d: 15 };
  it('a quantity: 0, the widest number, a negative', () => {
    expect(probes(typeField(f('Qty', 4), SHIFA), at)).toEqual([
      { value: '0', why: 'zero' },
      { value: '9999', why: 'max-width' },
      { value: '-1', why: 'negative' },
    ]);
  });

  it('a code: one that does not exist (shaped like the real ones), another real one, blank', () => {
    expect(probes(typeField(f('Code', 6), SHIFA), at)).toEqual([
      { value: 'ZZZ999', why: 'new-key' },
      { value: 'BRU400', why: 'existing-key' },
      { value: '', why: 'blank' },
    ]);
  });

  it('a date: long ago, later, and the other side of 2000', () => {
    expect(probes(typeField(f('Expiry', 8), SHIFA), at).map((p) => p.value)).toEqual([
      '01/01/80',
      '31/12/00',
      '01/01/00',
    ]);
    // An app in 2001 gets 31/12/1999.
    expect(
      probes(typeField(f('Fee month (MMYYYY)', 6), []), { y: 2001, m: 3, d: 12 }).map(
        (p) => p.value,
      ),
    ).toEqual(['011980', '122003', '121999']);
  });

  it('an amount: zero, a negative, the widest', () => {
    expect(probes(typeField(f('Amount Rs', 9), BARKAT), at).map((p) => p.value)).toEqual([
      '0.00',
      '-1.00',
      '999999.00',
    ]);
  });
});

describe('screenDate', () => {
  it('reads the app date from its title bar', () => {
    expect(screenDate([' SHIFA MEDICAL STORE  v2.3   MAIN MENU     15/07/98'])).toEqual({
      y: 1998,
      m: 7,
      d: 15,
    });
    expect(screenDate([' IQRA SCHOOL FEES 1.1   MAIN MENU   12-03-2001'])).toEqual({
      y: 2001,
      m: 3,
      d: 12,
    });
    expect(screenDate(['no date here'])).toBeNull();
  });
});

describe('fitsType', () => {
  it('refuses a value wider than the field, or not written as its type', () => {
    const qty = typeField(f('Qty', 4), SHIFA);
    expect(fitsType('12', qty)).toBe(true);
    expect(fitsType('12345', qty)).toBe(false);
    expect(fitsType('two', qty)).toBe(false);
    expect(fitsType('', qty)).toBe(true);
  });
});
