// Prompt 49 "done when": the generated inputs always fit the field's width and type.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { FieldInfo } from './actions';
import { fitsType, probes, typeField, typicalValue } from './inputs';
import type { DataSample } from './values';

/** Labels as the sample apps show them, and anything else. */
const label = fc.oneof(
  fc.constantFrom(
    'Code',
    'Qty',
    'Customer ID (blank = walk-in)',
    'Name',
    'Phone',
    'Student ID',
    'Fee month (MMYYYY)',
    'Party ID',
    'Amount Rs',
    'Note',
    'Expiry (DD/MM/YY)',
    'Date (DD-MM-YYYY)',
    'Bill date (YYYYMMDD)',
    'Price',
    'Batch No',
    '',
  ),
  fc.string({ maxLength: 30 }),
);

const field: fc.Arbitrary<FieldInfo> = fc.record({
  label,
  row: fc.nat(24),
  col: fc.nat(79),
  length: fc.option(fc.integer({ min: 1, max: 30 }), { nil: null }),
  kind: fc.constantFrom('reverse', 'underscore', 'prompt'),
});

const dbfName = fc.constantFrom(
  'CODE',
  'QTY',
  'NAME',
  'CUST_ID',
  'PARTY_ID',
  'AMOUNT',
  'EXPIRY',
  'PHONE',
  'FEE',
  'NOTE',
);
const sample: fc.Arbitrary<DataSample> = fc
  .record({
    file: fc.constantFrom('MEDICINE.DBF', 'PARTY.DBF', 'BILLS.DBF'),
    fields: fc.uniqueArray(
      fc.record({
        name: dbfName,
        type: fc.constantFrom('C', 'N', 'D'),
        length: fc.integer({ min: 1, max: 30 }),
      }),
      { selector: (f) => f.name, maxLength: 5 },
    ),
  })
  .chain((s) =>
    fc
      .array(
        fc.record(
          Object.fromEntries(
            s.fields.map((f) => [
              f.name,
              fc.oneof(fc.stringMatching(/^[A-Z]{1,3}\d{1,4}$/), fc.string({ maxLength: 12 })),
            ]),
          ) as Record<string, fc.Arbitrary<string>>,
        ),
        { maxLength: 4 },
      )
      .map((records) => ({ ...s, records })),
  );

const today = fc.option(
  fc.record({
    y: fc.integer({ min: 1980, max: 2030 }),
    m: fc.integer({ min: 1, max: 12 }),
    d: fc.integer({ min: 1, max: 28 }),
  }),
  { nil: null },
);

describe('the input strategy (invariant)', () => {
  it('every typical value and every probe fits the field width and its type', () => {
    fc.assert(
      fc.property(field, fc.array(sample, { maxLength: 3 }), today, (f, samples, now) => {
        const t = typeField(f, samples);
        if (f.length !== null) expect(t.width).toBe(f.length);
        const values = [typicalValue(t, now), ...probes(t, now).map((p) => p.value)];
        for (const v of values) {
          expect(v.length, JSON.stringify({ v, t })).toBeLessThanOrEqual(t.width);
          expect(fitsType(v, t), JSON.stringify({ v, t })).toBe(true);
        }
      }),
    );
  });

  it('probes are all different, and none is the typical value twice', () => {
    fc.assert(
      fc.property(field, fc.array(sample, { maxLength: 3 }), today, (f, samples, now) => {
        const ps = probes(typeField(f, samples), now).map((p) => p.value);
        expect(new Set(ps).size).toBe(ps.length);
      }),
    );
  });

  it('a new key is never one of the existing ones', () => {
    fc.assert(
      fc.property(field, fc.array(sample, { maxLength: 3 }), (f, samples) => {
        const t = typeField(f, samples);
        for (const p of probes(t, null))
          if (p.why === 'new-key') expect(t.existing).not.toContain(p.value);
      }),
    );
  });
});
