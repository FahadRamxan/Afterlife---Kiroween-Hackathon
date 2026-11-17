import { diffTables, type DbfField, type DbfRecord } from '@afterlife/dbf';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildDiffRows,
  columnWidth,
  fieldLabel,
  formatValue,
  clampCell,
  moveCell,
  tabStop,
  type GridKey,
} from './dbf-grid';

describe('clampCell (the active cell when rows change)', () => {
  it('keeps a cell that is still inside the grid', () => {
    expect(clampCell({ row: 3, col: 2 }, { rows: 10, cols: 5 })).toEqual({ row: 3, col: 2 });
  });

  it('moves to the last row when the table shrinks below the active row', () => {
    expect(clampCell({ row: 39, col: 6 }, { rows: 5, cols: 7 })).toEqual({ row: 4, col: 6 });
    expect(clampCell({ row: 3, col: 9 }, { rows: 5, cols: 4 })).toEqual({ row: 3, col: 3 });
  });

  it('is the first cell of an empty table', () => {
    expect(clampCell({ row: 7, col: 3 }, { rows: 0, cols: 4 })).toEqual({ row: 0, col: 0 });
  });

  it('always lands inside the grid, and never moves a cell that was already inside', () => {
    const cell = fc.record({ row: fc.nat(1000), col: fc.nat(50) });
    const size = fc.record({
      rows: fc.integer({ min: 1, max: 1000 }),
      cols: fc.integer({ min: 1, max: 50 }),
    });
    fc.assert(
      fc.property(cell, size, (at, s) => {
        const c = clampCell(at, s);
        expect(c.row).toBeGreaterThanOrEqual(0);
        expect(c.row).toBeLessThan(s.rows);
        expect(c.col).toBeGreaterThanOrEqual(0);
        expect(c.col).toBeLessThan(s.cols);
        if (at.row < s.rows && at.col < s.cols) expect(c).toEqual(at);
      }),
    );
  });
});

describe('tabStop (exactly one tab stop)', () => {
  it('is the active cell while its row is rendered', () => {
    expect(tabStop(3, [0, 1, 2, 3, 4], 40)).toBe('cell');
  });

  it('is the grid itself when the active row is scrolled out of the rendered window', () => {
    expect(tabStop(0, [30, 31, 32, 33], 40)).toBe('grid');
  });

  it('is the grid itself when the table is empty', () => {
    expect(tabStop(0, [], 0)).toBe('grid');
  });
});

const F: DbfField[] = [
  { name: 'CODE', type: 'C', length: 6, decimals: 0 },
  { name: 'QTY', type: 'N', length: 5, decimals: 0 },
  { name: 'PRICE', type: 'N', length: 8, decimals: 2 },
  { name: 'EXPIRY', type: 'D', length: 8, decimals: 0 },
  { name: 'OK', type: 'L', length: 1, decimals: 0 },
];
const r = (CODE: string, QTY: string, deleted = false): DbfRecord => ({
  deleted,
  values: { CODE, QTY, PRICE: '1.00', EXPIRY: '19991231', OK: true },
});

describe('fieldLabel', () => {
  it('shows the dBASE type and width', () => {
    expect(F.map(fieldLabel)).toEqual(['C(6)', 'N(5)', 'N(8,2)', 'D', 'L']);
    expect(fieldLabel({ name: 'NOTES', type: 'M', length: 10, decimals: 0 })).toBe('M');
  });
});

describe('formatValue', () => {
  it('shows values the way a DOS screen would', () => {
    expect(formatValue(F[3]!, '19991231')).toBe('31/12/1999');
    expect(formatValue(F[4]!, true)).toBe('T');
    expect(formatValue(F[4]!, false)).toBe('F');
    expect(formatValue(F[1]!, '-4')).toBe('-4');
    expect(formatValue(F[1]!, null)).toBe('');
    expect(formatValue(F[2]!, '********')).toBe('********');
  });
});

describe('buildDiffRows', () => {
  const before = { fields: F, records: [r('A1', '240'), r('B1', '180'), r('C1', '5')] };
  const after = {
    fields: F,
    records: [r('A1', '236'), r('B1', '180'), r('C1', '5', true), r('D1', '9')],
  };
  const rows = buildDiffRows(before, after, diffTables(before, after));

  it('keeps the old order, marks each row, and appends new records at the end', () => {
    expect(rows.map((x) => [x.kind, x.values.CODE])).toEqual([
      ['changed', 'A1'],
      ['same', 'B1'],
      ['deleted', 'C1'],
      ['inserted', 'D1'],
    ]);
  });

  it('records the old value of every changed cell', () => {
    expect(rows[0]!.changes).toEqual({ QTY: { before: '240', after: '236', delta: '-4' } });
    expect(rows[1]!.changes).toEqual({});
  });

  it('property: one row per live after-record plus one per deleted record', () => {
    const recs = fc.array(
      fc.tuple(
        fc.constantFrom('A1', 'B1', 'C1', 'D1', 'E1'),
        fc.integer({ min: 0, max: 99 }),
        fc.boolean(),
      ),
      {
        maxLength: 8,
      },
    );
    fc.assert(
      fc.property(recs, recs, (xs, ys) => {
        const uniq = (zs: typeof xs) => [...new Map(zs.map((z) => [z[0], z])).values()];
        const b = { fields: F, records: uniq(xs).map(([c, q, d]) => r(c, String(q), d)) };
        const a = { fields: F, records: uniq(ys).map(([c, q, d]) => r(c, String(q), d)) };
        const d = diffTables(b, a);
        const out = buildDiffRows(b, a, d);
        const live = a.records.filter((x) => !x.deleted).length;
        expect(out.filter((x) => x.kind !== 'deleted')).toHaveLength(live);
        expect(out.filter((x) => x.kind === 'deleted')).toHaveLength(d.deleted.length);
        expect(out.filter((x) => x.kind === 'inserted')).toHaveLength(d.inserted.length);
        expect(out.filter((x) => x.kind === 'changed')).toHaveLength(d.updated.length);
      }),
    );
  });
});

describe('moveCell (grid keyboard navigation)', () => {
  const size = { rows: 40, cols: 6 };
  const at = (row: number, col: number) => ({ row, col });

  it.each([
    ['ArrowDown', at(0, 0), at(1, 0)],
    ['ArrowUp', at(0, 0), at(0, 0)],
    ['ArrowRight', at(0, 5), at(0, 5)],
    ['ArrowLeft', at(3, 2), at(3, 1)],
    ['Home', at(3, 4), at(3, 0)],
    ['End', at(3, 1), at(3, 5)],
    ['PageDown', at(35, 2), at(39, 2)],
    ['PageUp', at(5, 2), at(0, 2)],
    ['PageDown', at(0, 2), at(10, 2)],
    ['CtrlHome', at(20, 3), at(0, 0)],
    ['CtrlEnd', at(2, 1), at(39, 5)],
  ] as [GridKey, { row: number; col: number }, { row: number; col: number }][])(
    '%s from %j goes to %j',
    (key, from, to) => {
      expect(moveCell(from, key, size)).toEqual(to);
    },
  );

  it('property: the active cell never leaves the grid', () => {
    const key = fc.constantFrom<GridKey>(
      'ArrowDown',
      'ArrowUp',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
      'PageUp',
      'PageDown',
      'CtrlHome',
      'CtrlEnd',
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 30 }),
        fc.array(key, { maxLength: 40 }),
        (rows, cols, keys) => {
          let cell = { row: 0, col: 0 };
          for (const k of keys) {
            cell = moveCell(cell, k, { rows, cols });
            expect(cell.row).toBeGreaterThanOrEqual(0);
            expect(cell.row).toBeLessThan(rows);
            expect(cell.col).toBeGreaterThanOrEqual(0);
            expect(cell.col).toBeLessThan(cols);
          }
        },
      ),
    );
  });
});

describe('columnWidth', () => {
  it('fits the header "NAME TYPE" side by side, plus padding', () => {
    expect(columnWidth({ name: 'PRICE', type: 'N', length: 8, decimals: 2 })).toBe(
      'PRICE N(8,2)'.length + 2,
    );
    expect(columnWidth({ name: 'QTY', type: 'N', length: 5, decimals: 0 })).toBe(
      'QTY N(5)'.length + 2,
    );
  });

  it('fits the widest value: a 20-character name, or a date as DD/MM/YYYY', () => {
    expect(columnWidth({ name: 'NAME', type: 'C', length: 20, decimals: 0 })).toBe(22);
    expect(columnWidth({ name: 'D', type: 'D', length: 8, decimals: 0 })).toBe(12);
  });
});
