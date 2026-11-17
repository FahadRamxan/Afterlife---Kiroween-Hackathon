// Pure helpers for DbfTable and DbfDiffView (tested in dbf-grid.test.ts).
import type { DbfField, DbfValue, Table, TableDiff } from '@afterlife/dbf';

/** dBASE notation: C(20), N(8,2), N(5), D, L, M. */
export function fieldLabel(f: DbfField): string {
  if (f.type === 'D' || f.type === 'L' || f.type === 'M') return f.type;
  if ((f.type === 'N' || f.type === 'F') && f.decimals > 0)
    return `${f.type}(${f.length},${f.decimals})`;
  return `${f.type}(${f.length})`;
}

/** A value as text: dates DD/MM/YYYY, logicals T/F, numbers exactly as stored (also ********). */
export function formatValue(f: DbfField, v: DbfValue): string {
  if (v === null) return '';
  if (f.type === 'D' && typeof v === 'string' && /^\d{8}$/.test(v))
    return `${v.slice(6)}/${v.slice(4, 6)}/${v.slice(0, 4)}`;
  if (f.type === 'L') return v ? 'T' : 'F';
  return String(v);
}

export const isNumeric = (f: DbfField) => f.type === 'N' || f.type === 'F';

export type RowKind = 'same' | 'changed' | 'inserted' | 'deleted';
export type CellChange = { before: DbfValue; after: DbfValue; delta?: string | null };

export type GridRow = {
  /** Record number in the table it is shown from (0-based; RECNO() is this + 1). */
  recno: number;
  kind: RowKind;
  values: Record<string, DbfValue>;
  /** Field -> old and new value, for changed rows. */
  changes: Record<string, CellChange>;
};

/** Rows for a single table. dBASE keeps deleted (*) records in the file, so they are shown struck. */
export function tableRows(t: Table): GridRow[] {
  return t.records.map((r, recno) => ({
    recno,
    kind: r.deleted ? 'deleted' : 'same',
    values: r.values,
    changes: {},
  }));
}

/**
 * Rows for a diff: the old live records in their old order (each shown as it is now, or as
 * deleted), then the new records at the end, where dBASE appends them.
 */
export function buildDiffRows(before: Table, after: Table, diff: TableDiff): GridRow[] {
  const id = (key: string | null, recno: number) => key ?? `#${recno}`;
  const deleted = new Map(diff.deleted.map((d) => [id(d.key, d.recno), d]));
  const updated = new Map(diff.updated.map((u) => [id(u.key, u.beforeRecno), u]));
  const keyOf = (values: Record<string, DbfValue>, recno: number) =>
    diff.key
      ? id(values[diff.key] === null ? '' : String(values[diff.key]), recno)
      : id(null, recno);
  const afterById = new Map<string, { recno: number; values: Record<string, DbfValue> }>();
  after.records.forEach((r, recno) => {
    if (!r.deleted) afterById.set(keyOf(r.values, recno), { recno, values: r.values });
  });

  const rows: GridRow[] = [];
  before.records.forEach((r, recno) => {
    if (r.deleted) return;
    const k = keyOf(r.values, recno);
    if (deleted.has(k)) {
      rows.push({ recno, kind: 'deleted', values: r.values, changes: {} });
      return;
    }
    const u = updated.get(k);
    const now = u ? after.records[u.afterRecno]! : afterById.get(k);
    const values = now?.values ?? r.values;
    const changes: Record<string, CellChange> = {};
    for (const c of u?.changes ?? [])
      changes[c.field] = { before: c.before, after: c.after, delta: c.delta };
    rows.push({
      recno: u ? u.afterRecno : (afterById.get(k)?.recno ?? recno),
      kind: u ? 'changed' : 'same',
      values,
      changes,
    });
  });
  for (const ins of diff.inserted)
    rows.push({ recno: ins.recno, kind: 'inserted', values: ins.values, changes: {} });
  return rows;
}

export type GridKey =
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Home'
  | 'End'
  | 'PageUp'
  | 'PageDown'
  | 'CtrlHome'
  | 'CtrlEnd';

export const PAGE_ROWS = 10;

/** WAI-ARIA grid keyboard movement, clamped to the grid. */
export function moveCell(
  at: { row: number; col: number },
  key: GridKey,
  size: { rows: number; cols: number },
): { row: number; col: number } {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max - 1, v));
  const { row, col } = at;
  switch (key) {
    case 'ArrowUp':
      return { row: clamp(row - 1, size.rows), col };
    case 'ArrowDown':
      return { row: clamp(row + 1, size.rows), col };
    case 'ArrowLeft':
      return { row, col: clamp(col - 1, size.cols) };
    case 'ArrowRight':
      return { row, col: clamp(col + 1, size.cols) };
    case 'Home':
      return { row, col: 0 };
    case 'End':
      return { row, col: size.cols - 1 };
    case 'PageUp':
      return { row: clamp(row - PAGE_ROWS, size.rows), col };
    case 'PageDown':
      return { row: clamp(row + PAGE_ROWS, size.rows), col };
    case 'CtrlHome':
      return { row: 0, col: 0 };
    case 'CtrlEnd':
      return { row: size.rows - 1, col: size.cols - 1 };
  }
}

/** The active cell kept inside the grid, for when `rows` shrinks below it. Empty grid: 0, 0. */
export function clampCell(
  at: { row: number; col: number },
  size: { rows: number; cols: number },
): { row: number; col: number } {
  if (size.rows === 0 || size.cols === 0) return { row: 0, col: 0 };
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max - 1, v));
  return { row: clamp(at.row, size.rows), col: clamp(at.col, size.cols) };
}

/**
 * Where the grid's one tab stop is. The active cell, if its row is rendered. Otherwise (scrolled
 * out of the virtual window, or an empty table) the grid itself, which moves focus to the cell.
 */
export function tabStop(
  activeRow: number,
  renderedRows: number[],
  rowCount: number,
): 'cell' | 'grid' {
  return rowCount > 0 && renderedRows.includes(activeRow) ? 'cell' : 'grid';
}

/** A keyboard event as a GridKey, or null if the grid does not handle it. */
export function gridKey(e: { key: string; ctrlKey: boolean; metaKey: boolean }): GridKey | null {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 'Home') return 'CtrlHome';
  if (ctrl && e.key === 'End') return 'CtrlEnd';
  const plain: GridKey[] = [
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Home',
    'End',
    'PageUp',
    'PageDown',
  ];
  return (plain as string[]).includes(e.key) ? (e.key as GridKey) : null;
}

/** Column width in ch: the header shows the name and the type label side by side ("PRICE N(8,2)"),
 * and the cells show values up to the field width (dates as DD/MM/YYYY). Plus 2 for padding. */
export function columnWidth(f: DbfField): number {
  const shown = f.type === 'D' ? 10 : f.length;
  return Math.max(f.name.length + 1 + fieldLabel(f).length, shown) + 2;
}
