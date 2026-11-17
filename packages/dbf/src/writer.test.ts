import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DbfError, readDbf, writeDbf, type DbfField, type DbfTable } from './index';

const GRAVEYARD = resolve(__dirname, '../../../samples/graveyard');
const samples = readdirSync(resolve(GRAVEYARD, 'dist'))
  .flatMap((app) => readdirSync(resolve(GRAVEYARD, 'dist', app)).map((f) => `${app}/${f}`))
  .filter((f) => f.endsWith('.DBF'));

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof DbfError) return e.code;
    throw e;
  }
  return undefined;
}

describe('byte-exact dBASE III output', () => {
  it('there are 9 sample files to compare with', () => {
    expect(samples).toHaveLength(9);
  });

  it.each(samples)('rewriting %s gives the same bytes our C library wrote', (path) => {
    const original = new Uint8Array(readFileSync(resolve(GRAVEYARD, 'dist', path)));
    const t = readDbf(original);
    const again = writeDbf({
      fields: t.fields,
      records: t.records,
      lastUpdate: t.header.lastUpdate,
      version: t.header.version,
    });
    expect(again).toEqual(original);
  });
});

describe('layout', () => {
  const fields: DbfField[] = [
    { name: 'CODE', type: 'C', length: 6, decimals: 0 },
    { name: 'PRICE', type: 'N', length: 8, decimals: 2 },
  ];
  const out = writeDbf({
    fields,
    records: [
      { deleted: false, values: { CODE: 'PAN500', PRICE: '45.50' } },
      { deleted: true, values: { CODE: 'AB', PRICE: '-1.25' } },
    ],
    lastUpdate: { year: 2001, month: 3, day: 12 },
  });
  const view = new DataView(out.buffer);
  const text = (from: number, to: number) => String.fromCharCode(...out.slice(from, to));

  it('writes the header: version, update date (year - 1900), count, lengths', () => {
    expect([out[0], out[1], out[2], out[3]]).toEqual([0x03, 101, 3, 12]);
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint16(8, true)).toBe(32 + 2 * 32 + 1);
    expect(view.getUint16(10, true)).toBe(1 + 6 + 8);
    expect([...out.slice(12, 32)].every((b) => b === 0)).toBe(true); // reserved bytes, code page 0
  });

  it('writes NUL-padded field descriptors and the 0x0D terminator', () => {
    expect(text(32, 43)).toBe('CODE\0\0\0\0\0\0\0');
    expect(text(43, 44)).toBe('C');
    expect([out[48], out[49]]).toEqual([6, 0]);
    expect(text(64, 69)).toBe('PRICE');
    expect([out[80], out[81]]).toEqual([8, 2]);
    expect(out[96]).toBe(0x0d);
  });

  it('writes fixed-width records: deletion flag, padded text, right-aligned numbers, then 0x1A', () => {
    expect(text(97, 112)).toBe(' PAN500   45.50');
    expect(text(112, 127)).toBe('*AB       -1.25');
    expect(out[127]).toBe(0x1a);
    expect(out).toHaveLength(128);
  });

  it('writes blanks the dBASE way: spaces for N, D and M, ? for L', () => {
    const f = writeDbf({
      fields: [
        { name: 'N', type: 'N', length: 4, decimals: 0 },
        { name: 'D', type: 'D', length: 8, decimals: 0 },
        { name: 'L', type: 'L', length: 1, decimals: 0 },
        { name: 'M', type: 'M', length: 10, decimals: 0 },
      ],
      records: [{ deleted: false, values: { N: null, D: null, L: null, M: null } }],
    });
    expect(String.fromCharCode(...f.slice(32 * 5 + 1, -1))).toBe(
      ' ' + ' '.repeat(4) + ' '.repeat(8) + '?' + ' '.repeat(10),
    );
  });

  it('defaults the update date to 1 Jan 1980, so output never depends on the clock', () => {
    const f = writeDbf({ fields, records: [] });
    expect([f[1], f[2], f[3]]).toEqual([80, 1, 1]);
  });
});

describe('values that do not fit are refused with a typed error', () => {
  const t = (
    type: DbfField['type'],
    length: number,
    decimals: number,
    value: unknown,
  ): DbfTable => ({
    fields: [{ name: 'X', type, length, decimals }],
    records: [{ deleted: false, values: { X: value as never } }],
  });

  it.each([
    ['a number wider than its field', t('N', 8, 2, '100000.00'), 'WIDTH'],
    ['a negative number one character too wide', t('N', 5, 2, '-10.00'), 'WIDTH'],
    ['text longer than its field', t('C', 3, 0, 'ABCD'), 'WIDTH'],
    ['a JS number (floats are not allowed)', t('N', 8, 2, 45.5), 'BAD_VALUE'],
    ['the wrong number of decimals', t('N', 8, 2, '45.5'), 'BAD_VALUE'],
    ['not a number', t('N', 8, 2, '12,50'), 'BAD_VALUE'],
    ['a bad date', t('D', 8, 0, '1998-07-15'), 'BAD_VALUE'],
    ['a character CP437 does not have', t('C', 3, 0, '€'), undefined],
    ['a string in a logical field', t('L', 1, 0, 'T'), 'BAD_VALUE'],
  ])('%s', (_label, table, code) => {
    if (code) expect(codeOf(() => writeDbf(table))).toBe(code);
    else expect(() => writeDbf(table)).toThrow(/CP437/);
  });

  it.each([
    ['a lower-case field name', [{ name: 'code', type: 'C', length: 6, decimals: 0 }]],
    ['an 11-character field name', [{ name: 'ABCDEFGHIJK', type: 'C', length: 6, decimals: 0 }]],
    [
      'duplicate names',
      [
        { name: 'A', type: 'C', length: 1, decimals: 0 },
        { name: 'A', type: 'C', length: 1, decimals: 0 },
      ],
    ],
    ['a 20-wide number', [{ name: 'A', type: 'N', length: 20, decimals: 0 }]],
    ['decimals with no room for the point', [{ name: 'A', type: 'N', length: 3, decimals: 2 }]],
    ['no fields', []],
  ] as [string, DbfField[]][])('rejects %s as BAD_FIELD', (_label, fields) => {
    expect(codeOf(() => writeDbf({ fields, records: [] }))).toBe('BAD_FIELD');
  });

  it('rejects a record missing a field', () => {
    expect(
      codeOf(() =>
        writeDbf({
          fields: [{ name: 'A', type: 'C', length: 1, decimals: 0 }],
          records: [{ deleted: false, values: {} }],
        }),
      ),
    ).toBe('BAD_VALUE');
  });

  it('property: an integer of n digits fits N(w,0) exactly when n (plus a sign) <= w', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 18n), max: 10n ** 18n }),
        fc.integer({ min: 1, max: 19 }),
        (v, w) => {
          const s = v.toString();
          const code = codeOf(() => writeDbf(t('N', w, 0, s)));
          expect(code).toBe(s.length <= w ? undefined : 'WIDTH');
        },
      ),
    );
  });
});
