import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DbfError, INSPECT_ROWS, inspectDbf, writeDbf, type DbfRecord } from './index';

const MEDICINE = new Uint8Array(
  readFileSync(resolve(__dirname, '../../../samples/graveyard/dist/shifa/MEDICINE.DBF')),
);

const table = (n: number) =>
  writeDbf({
    fields: [{ name: 'N', type: 'N', length: 5, decimals: 0 }],
    records: Array.from({ length: n }, (_, i): DbfRecord => ({
      deleted: false,
      values: { N: String(i + 1) },
    })),
    lastUpdate: { year: 1998, month: 7, day: 15 },
  });

describe('inspectDbf (what POST /api/dbf/inspect returns per file)', () => {
  it('describes the real Shifa MEDICINE.DBF: schema, record count and rows', () => {
    const t = inspectDbf(MEDICINE);
    expect(t.version).toBe(0x03);
    expect(t.recordCount).toBe(40);
    expect(t.fields.map((f) => f.name)).toEqual([
      'CODE',
      'NAME',
      'BATCH',
      'EXPIRY',
      'PRICE',
      'QTY',
    ]);
    expect(t.rows).toHaveLength(40);
    expect(t.rows[0]!.values).toMatchObject({ CODE: 'PAN500', PRICE: '12.50' });
    expect(t.moreRows).toBe(0);
    expect(t.warnings).toEqual([]);
    expect(t.lastUpdate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it(`returns at most ${INSPECT_ROWS} rows and says how many more there are`, () => {
    const t = inspectDbf(table(150));
    expect(t.recordCount).toBe(150);
    expect(t.rows).toHaveLength(100);
    expect(t.rows.at(-1)!.values.N).toBe('100');
    expect(t.moreRows).toBe(50);
  });

  it('rows + moreRows is always the record count', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 250 }), fc.integer({ min: 1, max: 120 }), (n, max) => {
        const t = inspectDbf(table(n), max);
        expect(t.rows.length).toBe(Math.min(n, max));
        expect(t.rows.length + t.moreRows).toBe(n);
      }),
      { numRuns: Math.min(Number(process.env.FC_NUM_RUNS ?? 100), 200) },
    );
  });

  it('formats the last update date as YYYY-MM-DD', () => {
    expect(inspectDbf(table(1)).lastUpdate).toBe('1998-07-15');
  });

  it('gives null, not a broken date, when the header date bytes are not a real date', () => {
    // Real files hold anything here: 0 from a tool that never set it, or junk. A month of 200
    // used to come out as "1998-200-15", which the API refused with a 500.
    for (const [month, day] of [
      [200, 15],
      [0, 0],
      [13, 1],
      [2, 30],
      [7, 0],
    ]) {
      const bytes = table(1).slice();
      bytes[2] = month!;
      bytes[3] = day!;
      expect(inspectDbf(bytes).lastUpdate, `month ${month}, day ${day}`).toBeNull();
    }
  });

  it('property: lastUpdate is always null or a real YYYY-MM-DD date', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), (m, d) => {
        const bytes = table(1).slice();
        bytes[2] = m;
        bytes[3] = d;
        const at = inspectDbf(bytes).lastUpdate;
        if (at === null) return;
        expect(at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(new Date(`${at}T00:00:00Z`).toISOString().slice(0, 10)).toBe(at);
      }),
    );
  });

  it('passes on reader warnings (a file cut short)', () => {
    const buf = table(3);
    const cut = buf.subarray(0, buf.length - 5); // drops the EOF byte and most of record 3
    const t = inspectDbf(cut);
    expect(t.recordCount).toBe(2);
    expect(t.warnings).toEqual([expect.objectContaining({ code: 'TRUNCATED' })]);
  });

  it('throws the typed DbfError for bytes that are not a .DBF', () => {
    expect(() => inspectDbf(new TextEncoder().encode('MZ this is an EXE, not a table'))).toThrow(
      DbfError,
    );
  });
});
