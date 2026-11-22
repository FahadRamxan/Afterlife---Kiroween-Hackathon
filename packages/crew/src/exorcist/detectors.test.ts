// @spec exorcist#1 Legacy bug detection.
// @spec exorcist#1.1 The detectors (Prompt 73), on the sample apps' real recorded runs and on small
// made-up cases: each finding with its evidence, severity, English and Urdu.
import type { DbfRecord, SnapshotDiff, TableDiff } from '@afterlife/dbf';
import type { Soul } from '@afterlife/soul';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  duplicateKeys,
  missingValidation,
  negativeAllowed,
  numericOverflow,
  passwords,
  roundingNoise,
  twoDigitYears,
} from './detectors';
import type { ExorcistInput, ObservedStep } from './types';

import { recordedInput } from './testing';
const EMPTY_DIFF: SnapshotDiff = { tables: {}, unchanged: [], addedTables: [], removedTables: [] };
const table = (t: Partial<TableDiff>): TableDiff => ({
  key: null,
  inserted: [],
  deleted: [],
  updated: [],
  schema: { added: [], removed: [] },
  ...t,
});
const step = (
  id: string,
  before: string[],
  after: string[],
  keys = '',
  dbfDiff = EMPTY_DIFF,
): ObservedStep => ({
  id,
  keys,
  screenBefore: { text: before },
  screenAfter: { text: after },
  dbfDiff,
});
const with_ = (base: ExorcistInput, x: Partial<ExorcistInput>): ExorcistInput => ({
  ...base,
  ...x,
});

const shifa = recordedInput('shifa');
const barkat = recordedInput('barkat');

describe('twoDigitYears', () => {
  it('Shifa: batches good until 2000 and 2001 shown as EXPIRED in 1998 (high), not the one that is', () => {
    const [f] = twoDigitYears(shifa);
    expect(f).toMatchObject({
      code: 'two-digit-year:medicine.expiry',
      smell: 'two-digit-year',
      severity: 'high',
      target: 'medicine.expiry',
    });
    const cited = f!.evidence.map((e) => e.text).join('\n');
    expect(cited).toContain('ORS001');
    expect(cited).toContain('MUL200');
    expect(cited).not.toContain('SEP200');
    expect(f!.en).toContain('two-digit years');
    expect(f!.since).toBe(1998);
  });

  it('dates shown with four-digit years give nothing, whatever the data (invariant)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 19900101, max: 20201231 }), { minLength: 1, maxLength: 10 }),
        (dates) => {
          const records = {
            ...shifa.records,
            'MEDICINE.DBF': dates.map((d, i) => ({
              deleted: false,
              values: {
                CODE: `M${i}`,
                NAME: 'X',
                BATCH: 'B',
                EXPIRY: String(d),
                PRICE: '1.00',
                QTY: '5',
              },
            })),
          } as Record<string, DbfRecord[]>;
          const screen = dates.map(
            (d, i) =>
              `M${i} X ${String(d).slice(6, 8)}/${String(d).slice(4, 6)}/${String(d).slice(0, 4)} EXPIRED`,
          );
          expect(
            twoDigitYears(with_(shifa, { records, observations: [step('o1', [], screen)] })),
          ).toEqual([]);
        },
      ),
    );
  });
});

describe('numericOverflow', () => {
  it('Barkat: a credit limit of Rs 150,000 on a balance that holds at most 99,999.99 (high)', () => {
    const f = numericOverflow(barkat).find((x) => x.target === 'party.balance')!;
    expect(f).toMatchObject({
      code: 'numeric-overflow:party.balance',
      smell: 'numeric-overflow',
      severity: 'high',
    });
    const cited = f.evidence.map((e) => e.text).join('\n');
    expect(cited).toContain('LIMIT 150000.00');
    expect(cited).toContain('99999.99');
    expect(cited).toMatch(/P001.*98500\.00/);
  });

  it('a value written as ******** is an overflow that already happened', () => {
    const records = {
      ...barkat.records,
      'PARTY.DBF': barkat.records['PARTY.DBF']!.map((r, i) =>
        i === 1 ? { ...r, values: { ...r.values, BALANCE: '********' } } : r,
      ),
    };
    const f = numericOverflow(with_(barkat, { records })).find(
      (x) => x.target === 'party.balance',
    )!;
    expect(f.evidence.some((e) => e.kind === 'record' && e.text.includes('********'))).toBe(true);
  });

  it('values well inside their fields give nothing (invariant)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 50_000 }), { minLength: 1, maxLength: 8 }),
        (balances) => {
          const records = {
            ...barkat.records,
            'PARTY.DBF': balances.map((b, i) => ({
              deleted: false,
              values: {
                PARTY_ID: `P${i}`,
                NAME: 'N',
                AREA: 'A',
                LIMIT: '60000.00',
                BALANCE: `${b}.00`,
                LAST_PAY: null,
              },
            })),
          } as Record<string, DbfRecord[]>;
          expect(numericOverflow(with_(barkat, { records, observations: [] }))).toEqual([]);
        },
      ),
    );
  });
});

describe('negativeAllowed', () => {
  it('Shifa: a quantity of 0 taken without the stock check, and F3 edits the last quantity (medium)', () => {
    const [f] = negativeAllowed(shifa);
    expect(f).toMatchObject({
      code: 'negative-allowed:medicine.qty',
      severity: 'medium',
      target: 'medicine.qty',
    });
    const cited = f!.evidence.map((e) => e.text).join('\n');
    expect(cited).toContain('0{Enter}');
    expect(cited).toContain('F3=Edit last qty');
  });

  it('a stock written below zero is high', () => {
    const diff: SnapshotDiff = {
      ...EMPTY_DIFF,
      tables: {
        'MEDICINE.DBF': table({
          key: 'CODE',
          updated: [
            {
              key: 'PAN500',
              beforeRecno: 0,
              afterRecno: 0,
              changes: [{ field: 'QTY', before: '2', after: '-3', delta: '-5' }],
            },
          ],
        }),
      },
    };
    const [f] = negativeAllowed(with_(shifa, { observations: [step('o9', [], [], '{F2}', diff)] }));
    expect(f).toMatchObject({ severity: 'high', target: 'medicine.qty' });
    expect(f!.evidence[0]).toMatchObject({ kind: 'observation', ref: 'o9' });
  });

  it('a 0 the app refuses is no finding', () => {
    const before = [' Code: PAN500   Qty:  ', ' Enter=Add  F3=Edit last qty'];
    const obs = [
      step(
        'o1',
        before,
        [' Code: PAN500   Qty:  ', ' QUANTITY MUST BE MORE THAN 0', ' F3=Edit last qty'],
        '0{Enter}',
      ),
    ];
    expect(negativeAllowed(with_(shifa, { observations: obs }))).toEqual([]);
  });
});

describe('the other smells', () => {
  const insert = (file: string, values: Record<string, string>): SnapshotDiff => ({
    ...EMPTY_DIFF,
    tables: { [file]: table({ inserted: [{ key: null, recno: 9, values }] }) },
  });

  it('a customer saved with a blank name (missing validation)', () => {
    const obs = [
      step(
        'o1',
        [],
        [],
        '{Enter}',
        insert('CUSTOMER.DBF', { CUST_ID: 'C0009', NAME: '', PHONE: '' }),
      ),
    ];
    const [f] = missingValidation(with_(shifa, { observations: obs }));
    expect(f).toMatchObject({ code: 'missing-validation:customer.name', severity: 'medium' });
    expect(missingValidation(shifa)).toEqual([]);
  });

  it('two records with one key (duplicate keys)', () => {
    const meds = shifa.records['MEDICINE.DBF']!;
    const records = { ...shifa.records, 'MEDICINE.DBF': [...meds, { ...meds[0]! }] };
    const [f] = duplicateKeys(with_(shifa, { records }));
    expect(f).toMatchObject({ code: 'duplicate-key:medicine.code', severity: 'medium' });
    expect(f!.evidence[0]!.text).toContain(String(meds[0]!.values.CODE).trim());
    expect(duplicateKeys(shifa)).toEqual([]);
  });

  it('float noise in a value the app wrote (rounding)', () => {
    const obs = [
      step(
        'o1',
        [],
        [],
        '{F2}',
        insert('BILLS.DBF', { BILL_NO: '9807-0001', NOTE: '849.9999999' }),
      ),
    ];
    expect(roundingNoise(with_(shifa, { observations: obs }))[0]).toMatchObject({
      smell: 'rounding',
      severity: 'low',
    });
    expect(roundingNoise(shifa)).toEqual([]);
  });

  it('a password field readable in a data file, and a password the login screen takes', () => {
    const soul: Soul = {
      ...shifa.soul,
      entities: [
        ...shifa.soul.entities,
        {
          id: 'user',
          name: 'User',
          file: 'USERS.DBF',
          fields: [
            { name: 'USER', type: 'C', length: 8, decimals: 0 },
            { name: 'PASSWORD', type: 'C', length: 8, decimals: 0 },
          ],
          key: ['USER'],
          foreignKeys: [],
          counters: [],
        },
      ],
    };
    const records = {
      ...shifa.records,
      'USERS.DBF': [{ deleted: false, values: { USER: 'ADMIN', PASSWORD: 'SHIFA98' } }],
    };
    const login = step(
      'o1',
      [' ENTER PASSWORD: '],
      [' MAIN MENU ', ' 1 New Bill'],
      'SHIFA98{Enter}',
    );
    const found = passwords(with_(shifa, { soul, records, observations: [login] }));
    expect(found.map((f) => [f.code, f.severity])).toEqual([
      ['readable-password:user.password', 'high'],
      ['hardcoded-password:app', 'high'],
    ]);
    // The password itself is never repeated in the evidence.
    expect(JSON.stringify(found)).not.toContain('SHIFA98');
    expect(passwords(shifa)).toEqual([]);
  });
});

describe('every finding', () => {
  it('has evidence, a severity, and English and Urdu text', () => {
    for (const input of [shifa, barkat, recordedInput('iqra')])
      for (const f of [
        twoDigitYears,
        numericOverflow,
        negativeAllowed,
        missingValidation,
        duplicateKeys,
        roundingNoise,
        passwords,
      ].flatMap((d) => d(input))) {
        expect(f.evidence.length, f.code).toBeGreaterThan(0);
        expect(['low', 'medium', 'high', 'critical']).toContain(f.severity);
        expect(f.en.length).toBeGreaterThan(20);
        expect(f.ur).toMatch(/[\u0600-\u06FF]/);
        expect(f.titleUr).toMatch(/[\u0600-\u06FF]/);
      }
  });
});
