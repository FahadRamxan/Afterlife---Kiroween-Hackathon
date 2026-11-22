// @spec undertaker#1 Migration (Prompt 64).
import type { DbfField, DbfRecord } from '@afterlife/dbf';
import type { Entity } from '@afterlife/soul';
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { graveyardTables, readCsv } from '../archaeologist/testing/graveyard-runs';
import { calendarDay, exportRecord, importRecord } from './convert';
import { migrate } from './migrate';

const SOUL = SHIFA_REFERENCE_SOUL;
const medicine = SOUL.entities.find((e) => e.id === 'medicine')!;
const seed = (app: string) =>
  Object.fromEntries(
    graveyardTables(app).map((f) => [`${f}.DBF`, readCsv(`${app}/seed/${f}.csv`).records]),
  );
const rec = (values: DbfRecord['values'], deleted = false): DbfRecord => ({ deleted, values });

describe('importRecord and exportRecord', () => {
  // @spec undertaker#1.1
  it('converts each type: text trimmed, dates as days, numbers as decimals, logicals', () => {
    const e: Pick<Entity, 'fields'> = {
      fields: [
        { name: 'NAME', type: 'C', length: 10, decimals: 0 },
        { name: 'DAY', type: 'D', length: 8, decimals: 0 },
        { name: 'PRICE', type: 'N', length: 8, decimals: 2 },
        { name: 'PAID', type: 'L', length: 1, decimals: 0 },
      ],
    };
    const r = importRecord(e, rec({ NAME: '  ALI ', DAY: '19980715', PRICE: '12.50', PAID: true }));
    expect(r.ok && r.typed.NAME).toBe('ALI');
    expect(r.ok && r.typed.DAY).toBe('1998-07-15');
    expect(r.ok && String(r.typed.PRICE)).toBe('12.5');
    expect(r.ok && r.typed.PAID).toBe(true);
    expect(importRecord(e, rec({ NAME: '', DAY: null, PRICE: null, PAID: null }))).toEqual({
      ok: true,
      typed: { NAME: '', DAY: null, PRICE: null, PAID: null },
    });
  });

  it('says which field could not be converted, why, and how to fix it', () => {
    expect(importRecord(medicine, rec({ ...base(), EXPIRY: '19990231' }))).toEqual({
      ok: false,
      field: 'EXPIRY',
      reason: 'EXPIRY is "19990231", which is not a day of the calendar',
      fix: 'Correct the date in EXPIRY, or blank it',
    });
    expect(importRecord(medicine, rec({ ...base(), PRICE: '12,50' }))).toMatchObject({
      ok: false,
      field: 'PRICE',
      reason: 'PRICE is "12,50", which is not a number',
    });
    expect(importRecord(medicine, rec({ ...base(), PRICE: '12.505' }))).toMatchObject({
      ok: false,
      field: 'PRICE',
      fix: 'Round PRICE to 2 places',
    });
  });

  it('export(import(record)) is the record, for every record of convertible types (round trip)', () => {
    const field = (name: string): fc.Arbitrary<DbfField> =>
      fc.oneof(
        fc.record({
          name: fc.constant(name),
          type: fc.constant('C' as const),
          length: fc.integer({ min: 1, max: 20 }),
          decimals: fc.constant(0),
        }),
        fc.record({
          name: fc.constant(name),
          type: fc.constant('N' as const),
          length: fc.integer({ min: 4, max: 12 }),
          decimals: fc.integer({ min: 0, max: 3 }),
        }),
        fc.record({
          name: fc.constant(name),
          type: fc.constant('D' as const),
          length: fc.constant(8),
          decimals: fc.constant(0),
        }),
        fc.record({
          name: fc.constant(name),
          type: fc.constant('L' as const),
          length: fc.constant(1),
          decimals: fc.constant(0),
        }),
      );
    // A value as a data file holds it: text without spaces at its ends, a number written with its
    // field's places, a real day, a logical; or blank.
    const value = (f: DbfField): fc.Arbitrary<DbfRecord['values'][string]> => {
      switch (f.type) {
        case 'C':
          return fc.oneof(
            fc.constant(''),
            fc
              .string({ unit: fc.constantFrom(...'AB C9-.'), minLength: 1, maxLength: f.length })
              .map((s) => s.trim()),
          );
        case 'N':
          return fc.oneof(
            fc.constant(null),
            fc
              .integer({ min: -99_999, max: 999_999 })
              .map((n) => (n / 10 ** f.decimals).toFixed(f.decimals)),
          );
        case 'D':
          return fc.oneof(
            fc.constant(null),
            fc
              .date({
                min: new Date('1980-01-01'),
                max: new Date('2030-12-31'),
                noInvalidDate: true,
              })
              .map((d) => d.toISOString().slice(0, 10).replace(/-/g, '')),
          );
        default:
          return fc.oneof(fc.constant(null), fc.boolean());
      }
    };
    fc.assert(
      fc.property(
        fc.tuple(field('A'), field('B'), field('C')).chain((fields) =>
          fc.tuple(
            fc.constant(fields),
            fc
              .tuple(...fields.map(value))
              .map((vs) => Object.fromEntries(fields.map((f, i) => [f.name, vs[i]!]))),
          ),
        ),
        ([fields, values]) => {
          const t = importRecord({ fields }, rec(values));
          if (!t.ok) throw new Error(t.reason);
          expect(exportRecord({ fields }, t.typed)).toEqual(values);
        },
      ),
    );
  });

  it('every day of the calendar is one, and nothing else is (invariant)', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('1900-01-01'), max: new Date('2099-12-31'), noInvalidDate: true }),
        (d) => {
          const iso = d.toISOString().slice(0, 10);
          expect(calendarDay(iso.replace(/-/g, ''))).toBe(iso);
        },
      ),
    );
    for (const s of ['19990231', '19981301', '1998071', 'ABCDEFGH', '19980700'])
      expect(calendarDay(s), s).toBeNull();
  });
});

function base() {
  return {
    CODE: 'PAN500',
    NAME: 'PANADOL 500MG STRIP',
    BATCH: 'B98031',
    EXPIRY: '19991231',
    PRICE: '12.50',
    QTY: '240',
  };
}

describe('migrate', () => {
  // @spec undertaker#1.2
  it.each(['shifa', 'iqra', 'barkat'])(
    '%s: every seed record crosses unchanged, none rejected',
    async (app) => {
      const tables = seed(app);
      const soul =
        app === 'shifa'
          ? SOUL
          : ({
              ...SOUL,
              entities: Object.keys(tables).map((file) => ({
                id: file.replace(/\.DBF$/, '').toLowerCase(),
                name: file,
                file,
                fields: readCsv(`${app}/seed/${file.replace(/\.DBF$/, '')}.csv`).fields,
                key: [],
                foreignKeys: [],
                counters: [],
              })),
            } as typeof SOUL);
      const m = migrate(soul, tables);
      expect(m.rejected).toEqual([]);
      for (const t of m.tables) {
        const live = tables[t.file]!.filter((r) => !r.deleted);
        expect(t.migrated, t.file).toEqual(live);
        expect(t.read - t.deleted).toBe(live.length);
      }
    },
  );

  it('rejects a bad date and a key used twice, leaves deleted records out, keeps the rest', () => {
    const tables = {
      'MEDICINE.DBF': [
        rec(base()),
        rec({ ...base(), CODE: 'BRU400', EXPIRY: '19990231' }),
        rec({ ...base(), NAME: 'PANADOL AGAIN' }),
        rec({ ...base(), CODE: 'OLD001' }, true),
        rec({ ...base(), CODE: 'FLA400' }),
      ],
    };
    const t = migrate(SOUL, tables).tables.find((x) => x.file === 'MEDICINE.DBF')!;
    expect(t).toMatchObject({ read: 5, deleted: 1 });
    expect(t.migrated.map((r) => r.values.CODE)).toEqual(['PAN500', 'FLA400']);
    expect(t.rejected).toEqual([
      {
        file: 'MEDICINE.DBF',
        entity: 'medicine',
        recno: 2,
        field: 'EXPIRY',
        reason: 'EXPIRY is "19990231", which is not a day of the calendar',
        fix: 'Correct the date in EXPIRY, or blank it',
      },
      {
        file: 'MEDICINE.DBF',
        entity: 'medicine',
        recno: 3,
        field: 'CODE',
        reason: "CODE PAN500 is also record 1's",
        fix: 'Give record 3 its own CODE, or delete one of the two',
      },
    ]);
  });

  it('every live record is migrated or rejected, per table (invariant)', () => {
    const day = fc.constantFrom('19991231', '19990231', null);
    const code = fc.constantFrom('PAN500', 'BRU400', 'FLA400', 'DIS500');
    fc.assert(
      fc.property(
        fc.array(fc.record({ code, day, deleted: fc.boolean() }), { maxLength: 15 }),
        (rows) => {
          const t = migrate(SOUL, {
            'MEDICINE.DBF': rows.map((r) =>
              rec({ ...base(), CODE: r.code, EXPIRY: r.day }, r.deleted),
            ),
          }).tables.find((x) => x.file === 'MEDICINE.DBF')!;
          expect(t.migrated.length + t.rejected.length).toBe(rows.filter((r) => !r.deleted).length);
          expect(t.deleted).toBe(rows.filter((r) => r.deleted).length);
          // No key twice among the records that crossed.
          const codes = t.migrated.map((r) => r.values.CODE);
          expect(new Set(codes).size).toBe(codes.length);
        },
      ),
    );
  });
});
