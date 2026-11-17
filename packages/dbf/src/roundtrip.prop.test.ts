// Prompt 17 done-when: readDbf(writeDbf(x)) == x for generated tables, over 1,000 runs.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { readDbf, writeDbf, type DbfField, type DbfRecord, type DbfTable } from './index';

/** Characters that survive CP437: printable ASCII plus some of the high half. */
const CHARS = [
  ...' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,-/()&*#',
  ...'ÇüéäåñÑ£¥░─│┌',
];

const fieldName = fc
  .tuple(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), fc.stringMatching(/^[A-Z0-9_]{0,9}$/))
  .map(([a, b]) => a + b);

const field: fc.Arbitrary<Omit<DbfField, 'name'>> = fc.oneof(
  fc.integer({ min: 1, max: 40 }).map((length) => ({ type: 'C' as const, length, decimals: 0 })),
  fc
    .tuple(fc.constantFrom('N' as const, 'F' as const), fc.integer({ min: 1, max: 19 }))
    .chain(([type, length]) =>
      fc
        .integer({ min: 0, max: length >= 3 ? Math.min(15, length - 2) : 0 })
        .map((decimals) => ({ type, length, decimals })),
    ),
  fc.constant({ type: 'D' as const, length: 8, decimals: 0 }),
  fc.constant({ type: 'L' as const, length: 1, decimals: 0 }),
  fc.constant({ type: 'M' as const, length: 10, decimals: 0 }),
);

/** A canonical decimal string that fits the field: no leading zeros, exactly `decimals` decimals. */
function numberText(length: number, decimals: number): fc.Arbitrary<string> {
  const intDigits = length - (decimals > 0 ? decimals + 1 : 0);
  return fc
    .tuple(
      fc.boolean(),
      fc.bigInt({ min: 0n, max: 10n ** BigInt(Math.max(intDigits, 1)) - 1n }),
      fc.bigInt({ min: 0n, max: 10n ** BigInt(decimals) - 1n }),
    )
    .map(([neg, i, d]) => {
      const text =
        (neg ? '-' : '') +
        i.toString() +
        (decimals > 0 ? '.' + d.toString().padStart(decimals, '0') : '');
      return text;
    })
    .filter((t) => t.length <= length && t !== '-0' && !/^-0\.0*$/.test(t));
}

const ymd = fc
  .date({
    min: new Date(Date.UTC(1900, 0, 1)),
    max: new Date(Date.UTC(2099, 11, 31)),
    noInvalidDate: true,
  })
  .map((d) => d.toISOString().slice(0, 10).replace(/-/g, ''));

function value(f: DbfField): fc.Arbitrary<DbfRecord['values'][string]> {
  switch (f.type) {
    case 'C':
      return fc
        .array(fc.constantFrom(...CHARS), { maxLength: f.length })
        .map((cs) => cs.join('').replace(/ +$/, ''));
    case 'N':
    case 'F':
      return fc.oneof(
        { weight: 8, arbitrary: numberText(f.length, f.decimals) },
        { weight: 1, arbitrary: fc.constant(null) },
        { weight: 1, arbitrary: fc.constant('*'.repeat(f.length)) },
      );
    case 'D':
      return fc.option(ymd, { nil: null });
    case 'L':
      return fc.option(fc.boolean(), { nil: null });
    case 'M':
      return fc.option(fc.integer({ min: 1, max: 999_999_999 }), { nil: null });
  }
}

const table: fc.Arbitrary<DbfTable> = fc
  .uniqueArray(fieldName, { minLength: 1, maxLength: 8 })
  .chain((names) =>
    fc.tuple(
      fc.constant(names),
      fc.array(field, { minLength: names.length, maxLength: names.length }),
    ),
  )
  .map(([names, defs]) => names.map((name, i) => ({ name, ...defs[i]! })))
  .chain((fields) =>
    fc.record({
      fields: fc.constant(fields),
      records: fc.array(
        fc.record({
          deleted: fc.boolean(),
          values: fc.record(Object.fromEntries(fields.map((f) => [f.name, value(f)]))),
        }),
        { maxLength: 15 },
      ),
      lastUpdate: fc.record({
        year: fc.integer({ min: 1900, max: 2155 }),
        month: fc.integer({ min: 1, max: 12 }),
        day: fc.integer({ min: 1, max: 28 }),
      }),
    }),
  );

describe('round trip', () => {
  it('property: readDbf(writeDbf(x)) == x (1,000 runs)', () => {
    fc.assert(
      fc.property(table, (t) => {
        const back = readDbf(writeDbf(t));
        expect(back.fields).toEqual(t.fields);
        expect(back.records).toEqual(t.records);
        expect(back.header.lastUpdate).toEqual(t.lastUpdate);
        expect(back.header.recordCount).toBe(t.records.length);
      }),
      { numRuns: Math.max(1000, fc.readConfigureGlobal().numRuns ?? 0) },
    );
  });

  it('property: write(read(write(x))) == write(x), byte for byte', () => {
    fc.assert(
      fc.property(table, (t) => {
        const once = writeDbf(t);
        const back = readDbf(once);
        expect(
          writeDbf({
            fields: back.fields,
            records: back.records,
            lastUpdate: back.header.lastUpdate,
          }),
        ).toEqual(once);
      }),
    );
  });
});
