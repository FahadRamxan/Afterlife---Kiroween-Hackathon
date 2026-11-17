// Prompt 19 on real data: the seed DBFs before a DOS session, against the data after it
// (samples/graveyard/fixtures/<app>/<scenario>/*.csv, dumped from DOSBox).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { diffSnapshots, diffTables, readDbf, writeDbf } from '@afterlife/dbf';
import { snapshotDir } from '@afterlife/dbf/node';
import { describe, expect, it } from 'vitest';
import { seedTable } from '../scripts/dbf-golden';
import { GRAVEYARD } from './helpers/graveyard';

const before = (app: string, table: string) =>
  readDbf(new Uint8Array(readFileSync(resolve(GRAVEYARD, 'dist', app, `${table}.DBF`))));
const after = (app: string, scenario: string, table: string) =>
  seedTable(
    readFileSync(resolve(GRAVEYARD, 'fixtures', app, scenario, `${table}.csv`), 'utf8'),
    '19980101',
  );
const diff = (app: string, scenario: string, table: string) =>
  diffTables(before(app, table), after(app, scenario, table));

describe('Shifa: saving a small bill (bill-small)', () => {
  it('MEDICINE: matched by CODE, two stock updates with exact deltas', () => {
    const d = diff('shifa', 'bill-small', 'MEDICINE');
    expect(d.key).toBe('CODE');
    expect(d.inserted).toEqual([]);
    expect(d.deleted).toEqual([]);
    expect(d.updated).toEqual([
      {
        key: 'PAN500',
        beforeRecno: 0,
        afterRecno: 0,
        changes: [{ field: 'QTY', before: '240', after: '236', delta: '-4' }],
      },
      {
        key: 'BRU400',
        beforeRecno: 1,
        afterRecno: 1,
        changes: [{ field: 'QTY', before: '180', after: '178', delta: '-2' }],
      },
    ]);
  });

  it('BILLS: matched by BILL_NO, one new bill', () => {
    const d = diff('shifa', 'bill-small', 'BILLS');
    expect(d.key).toBe('BILL_NO');
    expect(d.inserted).toEqual([
      {
        key: '9807-0001',
        recno: 3,
        values: {
          BILL_NO: '9807-0001',
          BILL_DATE: '19980715',
          CUST_ID: '',
          SUBTOTAL: '87.50',
          DISCOUNT: '0.00',
          GST: '14.87',
          TOTAL: '102.37',
        },
      },
    ]);
    expect(d.updated).toEqual([]);
  });

  it('BILLITEM: no unique key-like field, so matched by record number; two new lines', () => {
    const d = diff('shifa', 'bill-small', 'BILLITEM');
    expect(d.key).toBeNull();
    expect(d.inserted.map((r) => [r.recno, r.values.CODE, r.values.AMOUNT])).toEqual([
      [4, 'PAN500', '50.00'],
      [5, 'BRU400', '37.50'],
    ]);
  });

  it('CUSTOMER: nothing changed', () => {
    const d = diff('shifa', 'bill-small', 'CUSTOMER');
    expect([d.inserted, d.deleted, d.updated]).toEqual([[], [], []]);
  });
});

describe('Barkat: the N(8,2) overflow (overflow)', () => {
  it('PARTY: P001 drops from 98500.00 to 500.00 after the stars', () => {
    const d = diff('barkat', 'overflow', 'PARTY');
    expect(d.key).toBe('PARTY_ID');
    expect(d.updated).toEqual([
      {
        key: 'P001',
        beforeRecno: 0,
        afterRecno: 0,
        changes: [{ field: 'BALANCE', before: '98500.00', after: '500.00', delta: '-98000.00' }],
      },
    ]);
  });

  it('LEDGER: two entries, the first with ******** as its balance', () => {
    const d = diff('barkat', 'overflow', 'LEDGER');
    expect(d.key).toBe('ENTRY');
    expect(d.inserted.map((r) => [r.key, r.values.AMOUNT, r.values.BALANCE])).toEqual([
      ['81', '2000.00', '********'],
      ['82', '500.00', '500.00'],
    ]);
  });
});

describe('Iqra: paying March on 1 June (late-cap)', () => {
  it('PAYMENT: matched by RECEIPT, receipt 7 with the capped late fee', () => {
    const d = diff('iqra', 'late-cap', 'PAYMENT');
    expect(d.key).toBe('RECEIPT');
    expect(d.inserted).toHaveLength(1);
    expect(d.inserted[0]!.values).toMatchObject({
      RECEIPT: '7',
      LATE_FEE: '500.00',
      TOTAL: '1900.00',
    });
  });
});

describe('snapshotDir and diffSnapshots on a real folder', () => {
  it('snapshots the four Shifa files and diffs them against the state after a bill', async () => {
    const a = await snapshotDir(resolve(GRAVEYARD, 'dist', 'shifa'));
    expect(Object.keys(a.tables)).toEqual([
      'BILLITEM.DBF',
      'BILLS.DBF',
      'CUSTOMER.DBF',
      'MEDICINE.DBF',
    ]);
    const files: Record<string, Uint8Array> = {};
    for (const t of ['BILLITEM', 'BILLS', 'CUSTOMER', 'MEDICINE']) {
      const table = after('shifa', 'bill-small', t);
      // Same header date as the seed, so an untouched table has the same bytes and hash.
      files[`${t}.DBF`] = writeDbf({ ...table, lastUpdate: { year: 1998, month: 7, day: 1 } });
    }
    const { snapshot } = await import('@afterlife/dbf');
    const d = diffSnapshots(a, await snapshot(files));
    expect(d.unchanged).toEqual(['CUSTOMER.DBF']);
    expect(Object.keys(d.tables).sort()).toEqual(['BILLITEM.DBF', 'BILLS.DBF', 'MEDICINE.DBF']);
  });
});
