import 'fake-indexeddb/auto';
import type { TableDiff } from '@afterlife/dbf';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { IndexedDbEntityStore } from './indexeddb';
import { ConflictError, MemoryEntityStore, applyTableDiff } from './store';
import { storeContract } from './testing/store-contract';

describe('MemoryEntityStore', () => {
  storeContract(async () => new MemoryEntityStore());
});

let n = 0;
describe('IndexedDbEntityStore (fake IndexedDB)', () => {
  storeContract(async () => new IndexedDbEntityStore(`vessel-test-${n++}`));
});

describe('applyTableDiff', () => {
  const d = (x: Partial<TableDiff>): TableDiff => ({
    key: 'CODE',
    inserted: [],
    deleted: [],
    updated: [],
    schema: { added: [], removed: [] },
    ...x,
  });
  const records = [
    { deleted: false, values: { CODE: 'A', QTY: '5' } },
    { deleted: false, values: { CODE: 'B', QTY: '7' } },
  ];

  it('updates, deletes and appends, on a copy', () => {
    const out = applyTableDiff(
      'T.DBF',
      records,
      d({
        updated: [
          {
            key: 'A',
            beforeRecno: 0,
            afterRecno: 0,
            changes: [{ field: 'QTY', before: '5', after: '3' }],
          },
        ],
        deleted: [{ key: 'B', recno: 1, values: records[1]!.values }],
        inserted: [{ key: 'C', recno: 2, values: { CODE: 'C', QTY: '1' } }],
      }),
    );
    expect(out).toEqual([
      { deleted: false, values: { CODE: 'A', QTY: '3' } },
      { deleted: true, values: { CODE: 'B', QTY: '7' } },
      { deleted: false, values: { CODE: 'C', QTY: '1' } },
    ]);
    expect(records[0]!.values.QTY).toBe('5');
  });

  it('refuses a stale before, a taken record number, a missing record, a moved one', () => {
    const bad = [
      d({
        updated: [
          {
            key: 'A',
            beforeRecno: 0,
            afterRecno: 0,
            changes: [{ field: 'QTY', before: '9', after: '3' }],
          },
        ],
      }),
      d({ inserted: [{ key: 'C', recno: 1, values: {} }] }),
      d({ deleted: [{ key: 'Z', recno: 9, values: {} }] }),
      d({ updated: [{ key: 'A', beforeRecno: 0, afterRecno: 1, changes: [] }] }),
      d({ updated: [{ key: 'B', beforeRecno: 0, afterRecno: 0, changes: [] }] }),
    ];
    for (const x of bad) expect(() => applyTableDiff('T.DBF', records, x)).toThrow(ConflictError);
  });

  it('appending n records gives n more, the old ones unchanged (invariant)', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ maxLength: 4 }), { maxLength: 10 }), (codes) => {
        const out = applyTableDiff(
          'T.DBF',
          records,
          d({
            key: null,
            inserted: codes.map((c, i) => ({
              key: null,
              recno: records.length + i,
              values: { CODE: c },
            })),
          }),
        );
        expect(out).toHaveLength(records.length + codes.length);
        expect(out.slice(0, records.length)).toEqual(records);
      }),
    );
  });
});
