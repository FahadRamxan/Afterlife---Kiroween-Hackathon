import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dbfPreviewBytes, inspectDbf, readDbf, writeDbf, type DbfRecord } from './index';

const table = (n: number, version?: number) =>
  writeDbf({
    version,
    fields: [
      { name: 'CODE', type: 'C', length: 6, decimals: 0 },
      { name: 'QTY', type: 'N', length: 5, decimals: 0 },
    ],
    records: Array.from({ length: n }, (_, i): DbfRecord => ({
      deleted: i % 7 === 3,
      values: { CODE: `C${i}`, QTY: String(i) },
    })),
    lastUpdate: { year: 1998, month: 7, day: 15 },
  });

describe('dbfPreviewBytes (what the upload card sends)', () => {
  it('keeps the header and the first records only', () => {
    const full = table(5000);
    const cut = dbfPreviewBytes(full, 100);
    // header (32 + 2 fields x 32 + 1) + 100 records of 12 bytes
    expect(cut.length).toBe(97 + 100 * 12);
    expect(full.length).toBeGreaterThan(cut.length * 40);
  });

  it('a small file goes whole', () => {
    const full = table(10);
    expect(dbfPreviewBytes(full, 100)).toEqual(full);
  });

  it('a file whose header cannot be read is sent as at most 64 KB, so the API can say why', () => {
    expect(dbfPreviewBytes(new Uint8Array(0), 100)).toEqual(new Uint8Array(0));
    const junk = new Uint8Array(200_000).fill(0x41);
    expect(dbfPreviewBytes(junk, 100).length).toBe(64 * 1024);
  });

  it('property: inspecting the cut file with `cut` gives the full count, the same first rows, no warning', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 1, max: 150 }), (n, rows) => {
        const full = table(n);
        const viaCut = inspectDbf(dbfPreviewBytes(full, rows), rows, { cut: rows });
        const direct = inspectDbf(full, rows);
        expect(viaCut).toEqual(direct);
        expect(viaCut.recordCount).toBe(n);
        expect(viaCut.warnings).toEqual([]);
      }),
      { numRuns: Math.min(Number(process.env.FC_NUM_RUNS ?? 100), 300) },
    );
  });

  it('a file that is really cut short still warns, even when sent with `cut`', () => {
    const full = table(50);
    const broken = full.subarray(0, full.length - 30 * 12 - 1); // 20 records left
    const t = inspectDbf(broken, 100, { cut: 100 });
    expect(t.recordCount).toBe(20);
    expect(t.warnings).toEqual([expect.objectContaining({ code: 'TRUNCATED' })]);
  });
});

describe('dBASE IV and FoxBASE+ (the dBASE III layout)', () => {
  it.each([
    [0x8b, 'dBASE IV with memo', true],
    [0xfb, 'FoxBASE+', false],
  ])('reads version 0x%s (%s)', (version, _name, memo) => {
    const dbf = readDbf(table(3, version));
    expect(dbf.header).toMatchObject({ version, hasMemo: memo });
    expect(dbf.records.map((r) => r.values.CODE)).toEqual(['C0', 'C1', 'C2']);
  });
});
