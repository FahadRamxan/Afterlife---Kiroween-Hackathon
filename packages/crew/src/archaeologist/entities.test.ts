import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { diffSnapshots, readDbf, snapshot, type DbfFile, type SnapshotDiff } from '@afterlife/dbf';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SHIFA_REFERENCE_SOUL } from '../../../soul/src/examples/shifa';
import {
  counterPattern,
  detectCounters,
  detectEntities,
  detectForeignKeys,
  detectKeys,
  detectDerived,
  nextCounter,
  type TableInput,
} from './entities';

const DIST = resolve(__dirname, '../../../../samples/graveyard/dist/shifa');
const dbf = (f: string) => readDbf(readFileSync(resolve(DIST, f)));
const FILES = ['MEDICINE.DBF', 'CUSTOMER.DBF', 'BILLS.DBF', 'BILLITEM.DBF'];
const shifa = (): TableInput[] => FILES.map((file) => ({ file, table: dbf(file) }));

/** A table from rows, all character fields. */
function table(fields: [string, 'C' | 'N', number, number?][], rows: (string | null)[][]): DbfFile {
  return {
    header: {
      version: 3,
      lastUpdate: { year: 98, month: 7, day: 15 },
      recordCount: rows.length,
      headerLength: 0,
      recordLength: 0,
      codePage: 0,
    },
    fields: fields.map(([name, type, length, decimals = 0]) => ({ name, type, length, decimals })),
    records: rows.map((r) => ({
      deleted: false,
      values: Object.fromEntries(fields.map(([n], i) => [n, r[i] ?? null])),
    })),
  } as DbfFile;
}

describe('detectKeys', () => {
  it('a field unique in every record is a key; one that repeats or is blank is not', () => {
    const t = table(
      [
        ['CODE', 'C', 6],
        ['NAME', 'C', 20],
        ['QTY', 'N', 5],
      ],
      [
        ['A1', 'X', '1'],
        ['B2', 'X', '2'],
        ['C3', 'Y', '3'],
      ],
    );
    // QTY is unique here too, but a number that observations change is no key.
    expect(detectKeys({ file: 'T.DBF', table: t }, [])).toEqual(['CODE']);
  });

  it('a key is never updated: a unique field the app changes is not one', () => {
    const t = table(
      [
        ['CODE', 'C', 6],
        ['PRICE', 'C', 8],
      ],
      [
        ['A1', '10'],
        ['B2', '20'],
      ],
    );
    const changed: SnapshotDiff = {
      tables: {
        'T.DBF': {
          key: 'CODE',
          inserted: [],
          deleted: [],
          schema: { added: [], removed: [] },
          updated: [
            {
              key: 'A1',
              beforeRecno: 0,
              afterRecno: 0,
              changes: [{ field: 'PRICE', before: '10', after: '11' }],
            },
          ],
        },
      },
      unchanged: [],
      addedTables: [],
      removedTables: [],
    };
    expect(detectKeys({ file: 'T.DBF', table: t }, [changed])).toEqual(['CODE']);
  });

  it('a field that refers to another table is not a key alone; the first pair that is unique is', () => {
    const items = { file: 'BILLITEM.DBF', table: dbf('BILLITEM.DBF') };
    // In Shifa's 4 sample lines no medicine is sold twice, so CODE is unique by chance.
    expect(detectKeys(items, [])).toEqual(['CODE']);
    // It names a medicine and BILL_NO names a bill: the key is a bill and its line.
    expect(detectKeys(items, [], new Set(['BILL_NO', 'CODE']))).toEqual(['BILL_NO', 'LINE']);
  });
});

describe('detectForeignKeys', () => {
  it("a field whose every value is another table's key refers to it; blanks are allowed", () => {
    const fks = detectForeignKeys(shifa(), {
      'MEDICINE.DBF': ['CODE'],
      'CUSTOMER.DBF': ['CUST_ID'],
      'BILLS.DBF': ['BILL_NO'],
      'BILLITEM.DBF': ['BILL_NO', 'LINE'],
    });
    expect(fks['BILLITEM.DBF']).toEqual([
      { fields: ['BILL_NO'], references: { file: 'BILLS.DBF', fields: ['BILL_NO'] } },
      { fields: ['CODE'], references: { file: 'MEDICINE.DBF', fields: ['CODE'] } },
    ]);
    // A walk-in bill leaves CUST_ID blank; every one that is set is a customer.
    expect(fks['BILLS.DBF']).toEqual([
      { fields: ['CUST_ID'], references: { file: 'CUSTOMER.DBF', fields: ['CUST_ID'] } },
    ]);
    expect(fks['MEDICINE.DBF'] ?? []).toEqual([]);
  });
});

describe('counters', () => {
  it('counterPattern reads the shape of an id: letters stay, digits become #, a date part YYMM', () => {
    expect(counterPattern(['C0001', 'C0002', 'C0008'])).toBe('C####');
    expect(
      counterPattern(['9806-0001', '9806-0002', '9807-0001'], ['19980610', '19980622', '19980715']),
    ).toBe('YYMM-####');
    expect(counterPattern(['PAN500', 'BRU400'])).toBeNull();
    expect(counterPattern(['A', 'B'])).toBeNull();
  });

  it('nextCounter gives the next one: C0009 after C0008; a new month starts at 0001', () => {
    expect(nextCounter('C####', ['C0001', 'C0008'])).toBe('C0009');
    expect(nextCounter('YYMM-####', ['9806-0001', '9806-0003'], { year: 1998, month: 6 })).toBe(
      '9806-0004',
    );
    expect(nextCounter('YYMM-####', ['9806-0001', '9806-0003'], { year: 1998, month: 7 })).toBe(
      '9807-0001',
    );
  });

  it('a counter is confirmed by the records the app inserts: each one the next number', () => {
    const t = { file: 'CUSTOMER.DBF', table: dbf('CUSTOMER.DBF') };
    const before = t.table.records.map((r) => String(r.values.CUST_ID));
    const insert = (id: string): SnapshotDiff => ({
      tables: {
        'CUSTOMER.DBF': {
          key: 'CUST_ID',
          inserted: [{ key: id, recno: 9, values: { CUST_ID: id, NAME: 'X', PHONE: '' } }],
          deleted: [],
          updated: [],
          schema: { added: [], removed: [] },
        },
      },
      unchanged: [],
      addedTables: [],
      removedTables: [],
    });
    expect(detectCounters(t, ['CUST_ID'], [insert('C0009')])).toEqual([
      { field: 'CUST_ID', pattern: 'C####' },
    ]);
    // An inserted id that is not the next one: the app does not number them, the user does.
    expect(detectCounters(t, ['CUST_ID'], [insert('C0042')])).toEqual([]);
    expect(before).toContain('C0008');
  });

  it('the next number always fits the pattern and is new (invariant)', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 9998 }), { minLength: 1, maxLength: 30 }),
        (ns) => {
          const ids = ns.map((n) => `C${String(n).padStart(4, '0')}`);
          const next = nextCounter('C####', ids)!;
          expect(next).toMatch(/^C\d{4}$/);
          expect(ids).not.toContain(next);
          expect(Number(next.slice(1))).toBe(Math.max(...ns) + 1);
        },
      ),
    );
  });
});

describe('numbered counters (Iqra receipts, Barkat ledger entries)', () => {
  const receipts = table(
    [
      ['RECEIPT', 'N', 6],
      ['STU_ID', 'C', 5],
      ['FEE_MONTH', 'C', 6],
    ],
    [
      ['1', 'S0001', '200102'],
      ['2', 'S0002', '200102'],
      ['3', 'S0001', '200103'],
    ],
  );
  const insert = (n: string): SnapshotDiff => ({
    tables: {
      'PAYMENT.DBF': {
        key: null,
        inserted: [
          { key: null, recno: 3, values: { RECEIPT: n, STU_ID: 'S0002', FEE_MONTH: '200103' } },
        ],
        deleted: [],
        updated: [],
        schema: { added: [], removed: [] },
      },
    },
    unchanged: [],
    addedTables: [],
    removedTables: [],
  });

  it('a whole number the app gives one more than the highest is the key and a counter', async () => {
    const [e] = await detectEntities([{ file: 'PAYMENT.DBF', table: receipts }], [insert('4')]);
    expect(e!.key).toEqual(['RECEIPT']);
    expect(e!.counters).toEqual([{ field: 'RECEIPT', pattern: 'n+1' }]);
  });

  it('not when the number inserted is not the next one, or nothing was inserted', async () => {
    const [skipped] = await detectEntities(
      [{ file: 'PAYMENT.DBF', table: receipts }],
      [insert('9')],
    );
    expect(skipped!.counters).toEqual([]);
    expect(skipped!.key).toEqual(['STU_ID', 'FEE_MONTH']);
    const [none] = await detectEntities([{ file: 'PAYMENT.DBF', table: receipts }], []);
    expect(none!.counters).toEqual([]);
  });
});

describe('detectDerived', () => {
  it('a field that is always the product or the sum of others in its record', () => {
    expect(detectDerived({ file: 'BILLITEM.DBF', table: dbf('BILLITEM.DBF') })).toEqual([
      { field: 'AMOUNT', expression: 'qty * price' },
    ]);
    expect(detectDerived({ file: 'BILLS.DBF', table: dbf('BILLS.DBF') })).toContainEqual({
      field: 'TOTAL',
      expression: 'subtotal - discount + gst',
    });
  });
});

describe('Prompt 53 done when: on Shifa', () => {
  it('detects MEDICINE.CODE, the BILLITEM.BILL_NO -> BILLS.BILL_NO link and the YYMM-#### pattern', async () => {
    const entities = await detectEntities(shifa(), await shifaSaves());
    const by = (file: string) => entities.find((e) => e.file === file)!;
    expect(by('MEDICINE.DBF').key).toEqual(['CODE']);
    expect(by('BILLITEM.DBF').foreignKeys).toContainEqual({
      fields: ['BILL_NO'],
      references: { entity: 'bill', fields: ['BILL_NO'] },
    });
    expect(by('BILLS.DBF').counters).toEqual([{ field: 'BILL_NO', pattern: 'YYMM-####' }]);
    // The same entities as the reference Soul our team wrote from the source: the answer key.
    for (const ref of SHIFA_REFERENCE_SOUL.entities) {
      const got = by(ref.file);
      expect(got.id, ref.file).toBe(ref.id);
      expect(got.key, ref.file).toEqual(ref.key);
      expect(got.foreignKeys, ref.file).toEqual(ref.foreignKeys);
      expect(got.counters, ref.file).toEqual(ref.counters);
      expect(got.fields, ref.file).toEqual(ref.fields);
    }
  });
});

/** A bill and a customer saved on Shifa's real files: the observations the counters are seen in. */
async function shifaSaves(): Promise<SnapshotDiff[]> {
  const before = Object.fromEntries(
    FILES.map((f) => [f, new Uint8Array(readFileSync(resolve(DIST, f)))]),
  );
  const { writeDbf } = await import('@afterlife/dbf');
  const plus = (file: string, values: Record<string, string>) => {
    const t = dbf(file);
    return writeDbf({
      fields: t.fields,
      records: [...t.records, { deleted: false, values }],
      lastUpdate: { year: 1998, month: 7, day: 15 },
    });
  };
  const bill = {
    ...before,
    'BILLS.DBF': plus('BILLS.DBF', {
      BILL_NO: '9807-0001',
      BILL_DATE: '19980715',
      CUST_ID: '',
      SUBTOTAL: '25.00',
      DISCOUNT: '0.00',
      GST: '4.25',
      TOTAL: '29.25',
    }),
    'BILLITEM.DBF': plus('BILLITEM.DBF', {
      BILL_NO: '9807-0001',
      LINE: '1',
      CODE: 'PAN500',
      QTY: '2',
      PRICE: '12.50',
      AMOUNT: '25.00',
    }),
  };
  const customer = {
    ...before,
    'CUSTOMER.DBF': plus('CUSTOMER.DBF', {
      CUST_ID: 'C0009',
      NAME: 'ALI RAZA',
      PHONE: '051-4567890',
    }),
  };
  return [
    diffSnapshots(await snapshot(before), await snapshot(bill)),
    diffSnapshots(await snapshot(before), await snapshot(customer)),
  ];
}
