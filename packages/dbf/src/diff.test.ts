import { describe, expect, it } from 'vitest';
import { detectKey, diffSnapshots, diffTables, isEmptyDiff, numericDelta, snapshot } from './index';
import type { DbfField, DbfRecord } from './index';

const F: DbfField[] = [
  { name: 'CODE', type: 'C', length: 6, decimals: 0 },
  { name: 'NAME', type: 'C', length: 10, decimals: 0 },
  { name: 'QTY', type: 'N', length: 5, decimals: 0 },
  { name: 'PRICE', type: 'N', length: 8, decimals: 2 },
];
const rec = (
  CODE: string,
  NAME: string,
  QTY: string | null,
  PRICE: string | null,
  deleted = false,
): DbfRecord => ({
  deleted,
  values: { CODE, NAME, QTY, PRICE },
});
const t = (...records: DbfRecord[]) => ({ fields: F, records });

describe('numericDelta', () => {
  it('subtracts exactly, keeping the field decimals', () => {
    expect(numericDelta('240', '236', 0)).toBe('-4');
    expect(numericDelta('5340.00', '5790.00', 2)).toBe('450.00');
    expect(numericDelta('0.10', '0.30', 2)).toBe('0.20'); // 0.1 + 0.2 trouble with floats
    expect(numericDelta('-1.25', '1.25', 2)).toBe('2.50');
  });

  it('has no delta when a side is blank or dBASE overflow stars', () => {
    expect(numericDelta(null, '5', 0)).toBeNull();
    expect(numericDelta('98500.00', '********', 2)).toBeNull();
  });
});

describe('detectKey', () => {
  it('picks a unique, never-blank field whose name looks like a key', () => {
    expect(
      detectKey(F, [t(rec('A1', 'X', '1', '1.00'), rec('A2', 'X', '1', '1.00')).records]),
    ).toBe('CODE');
  });

  it('needs the key to be unique in every snapshot', () => {
    expect(
      detectKey(F, [
        [rec('A1', 'X', '1', '1.00')],
        [rec('A1', 'X', '1', '1.00'), rec('A1', 'Y', '2', '1.00')],
      ]),
    ).toBeNull();
  });

  it('ignores deleted records when checking uniqueness', () => {
    expect(detectKey(F, [[rec('A1', 'X', '1', '1.00', true), rec('A1', 'Y', '2', '1.00')]])).toBe(
      'CODE',
    );
  });

  it('never picks a field without a key-like name, even if its values happen to be unique', () => {
    const fields: DbfField[] = [{ name: 'QTY', type: 'N', length: 5, decimals: 0 }];
    expect(
      detectKey(fields, [
        [
          { deleted: false, values: { QTY: '1' } },
          { deleted: false, values: { QTY: '2' } },
        ],
      ]),
    ).toBeNull();
  });

  it('refuses a key with blank values', () => {
    expect(detectKey(F, [[rec('', 'X', '1', '1.00'), rec('A2', 'X', '1', '1.00')]])).toBeNull();
  });
});

describe('diffTables by key', () => {
  const before = t(
    rec('PAN500', 'PANADOL', '240', '12.50'),
    rec('BRU400', 'BRUFEN', '180', '18.75'),
    rec('OLD001', 'OLD', '1', '1.00'),
  );
  const after = t(
    rec('PAN500', 'PANADOL', '236', '12.50'),
    rec('BRU400', 'BRUFEN', '180', '18.75'),
    rec('OLD001', 'OLD', '1', '1.00', true),
    rec('NEW001', 'NEW', '5', '2.00'),
  );
  const d = diffTables(before, after);

  it('matches by CODE', () => {
    expect(d.key).toBe('CODE');
  });

  it('finds the update with a field-level change and an exact numeric delta', () => {
    expect(d.updated).toEqual([
      {
        key: 'PAN500',
        beforeRecno: 0,
        afterRecno: 0,
        changes: [{ field: 'QTY', before: '240', after: '236', delta: '-4' }],
      },
    ]);
  });

  it('a record flagged * counts as deleted; a new one as inserted', () => {
    expect(d.deleted).toEqual([{ key: 'OLD001', recno: 2, values: before.records[2]!.values }]);
    expect(d.inserted).toEqual([{ key: 'NEW001', recno: 3, values: after.records[3]!.values }]);
  });

  it('a key that changes is a delete plus an insert', () => {
    const renamed = diffTables(
      t(rec('A1', 'X', '1', '1.00'), rec('B1', 'Y', '1', '1.00')),
      t(rec('A2', 'X', '1', '1.00'), rec('B1', 'Y', '1', '1.00')),
    );
    expect(renamed.deleted.map((r) => r.key)).toEqual(['A1']);
    expect(renamed.inserted.map((r) => r.key)).toEqual(['A2']);
  });
});

describe('diffTables by record number', () => {
  it('falls back to record numbers when there is no key', () => {
    const fields: DbfField[] = [
      { name: 'BILL_NO', type: 'C', length: 9, decimals: 0 },
      { name: 'QTY', type: 'N', length: 5, decimals: 0 },
    ];
    const r = (b: string, q: string): DbfRecord => ({
      deleted: false,
      values: { BILL_NO: b, QTY: q },
    });
    const d = diffTables(
      { fields, records: [r('9806-0001', '20'), r('9806-0001', '5')] },
      { fields, records: [r('9806-0001', '20'), r('9806-0001', '7'), r('9807-0001', '4')] },
    );
    expect(d.key).toBeNull();
    expect(d.updated).toEqual([
      {
        key: null,
        beforeRecno: 1,
        afterRecno: 1,
        changes: [{ field: 'QTY', before: '5', after: '7', delta: '2' }],
      },
    ]);
    expect(d.inserted).toEqual([
      { key: null, recno: 2, values: { BILL_NO: '9807-0001', QTY: '4' } },
    ]);
  });
});

describe('schema changes', () => {
  it('compares the common fields and reports added and removed ones', () => {
    const wider: DbfField[] = [
      ...F.slice(0, 3),
      { name: 'BATCH', type: 'C', length: 8, decimals: 0 },
    ];
    const d = diffTables(t(rec('A1', 'X', '1', '1.00')), {
      fields: wider,
      records: [{ deleted: false, values: { CODE: 'A1', NAME: 'X', QTY: '2', BATCH: 'B1' } }],
    });
    expect(d.schema).toEqual({ added: ['BATCH'], removed: ['PRICE'] });
    expect(d.updated[0]!.changes).toEqual([{ field: 'QTY', before: '1', after: '2', delta: '1' }]);
  });
});

describe('snapshot and diffSnapshots', () => {
  const enc = (s: string) => new TextEncoder().encode(s);

  it('hashes every file with SHA-256 and parses the DBFs', async () => {
    const { writeDbf } = await import('./index');
    const bytes = writeDbf(t(rec('A1', 'X', '1', '1.00')));
    const s = await snapshot({ 'MEDICINE.DBF': bytes, 'README.TXT': enc('hi') });
    expect(Object.keys(s.tables)).toEqual(['MEDICINE.DBF']);
    expect(s.tables['MEDICINE.DBF']!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(s.tables['MEDICINE.DBF']!.table.records).toHaveLength(1);
  });

  it('treats file names case-insensitively, as DOS does', async () => {
    const { writeDbf } = await import('./index');
    const s = await snapshot({ 'medicine.dbf': writeDbf(t()) });
    expect(Object.keys(s.tables)).toEqual(['MEDICINE.DBF']);
  });

  it('skips files whose hash did not change, and reports added and removed tables', async () => {
    const { writeDbf } = await import('./index');
    const a = await snapshot({
      'A.DBF': writeDbf(t(rec('A1', 'X', '1', '1.00'))),
      'GONE.DBF': writeDbf(t()),
    });
    const b = await snapshot({
      'A.DBF': writeDbf(t(rec('A1', 'X', '1', '1.00'))),
      'NEW.DBF': writeDbf(t()),
    });
    const d = diffSnapshots(a, b);
    expect(d.unchanged).toEqual(['A.DBF']);
    expect(d.addedTables).toEqual(['NEW.DBF']);
    expect(d.removedTables).toEqual(['GONE.DBF']);
    expect(d.tables).toEqual({});
  });

  it('isEmptyDiff is true only when nothing changed', async () => {
    const { writeDbf } = await import('./index');
    const a = await snapshot({ 'A.DBF': writeDbf(t(rec('A1', 'X', '1', '1.00'))) });
    const b = await snapshot({ 'A.DBF': writeDbf(t(rec('A1', 'X', '2', '1.00'))) });
    expect(isEmptyDiff(diffSnapshots(a, a))).toBe(true);
    expect(isEmptyDiff(diffSnapshots(a, b))).toBe(false);
  });

  it('rejects a corrupt DBF with a clear error naming the file', async () => {
    await expect(snapshot({ 'BAD.DBF': enc('not a dbf at all, just text...') })).rejects.toThrow(
      /BAD\.DBF/,
    );
  });
});
