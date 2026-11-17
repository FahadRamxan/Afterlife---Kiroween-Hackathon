'use client';

import type { DbfField, DbfRecord, Table, TableDiff } from '@afterlife/dbf';
import { useMemo } from 'react';
import { DbfGrid } from './DbfGrid';
import { DiffBadge } from './DiffBadge';
import { buildDiffRows, tableRows } from './dbf-grid';
import { cn } from './cn';

export type DbfTableProps = {
  caption: string;
  fields: DbfField[];
  records: DbfRecord[];
  height?: number;
  className?: string;
};

/** One .DBF table, every record, field types in the header. Deleted (*) records are struck. */
export function DbfTable({ caption, fields, records, height, className }: DbfTableProps) {
  const rows = useMemo(() => tableRows({ fields, records }), [fields, records]);
  return (
    <DbfGrid caption={caption} fields={fields} rows={rows} height={height} className={className} />
  );
}

export type DbfDiffViewProps = {
  caption: string;
  before: Table;
  after: Table;
  /** From diffTables(before, after) in @afterlife/dbf. */
  diff: TableDiff;
  height?: number;
  className?: string;
};

/**
 * What changed in a table: inserted rows teal, deleted rows red and struck through, changed cells
 * amber with an "old → new" tooltip (on hover and on keyboard focus).
 */
export function DbfDiffView({ caption, before, after, diff, height, className }: DbfDiffViewProps) {
  const rows = useMemo(() => buildDiffRows(before, after, diff), [before, after, diff]);
  const changedCells = diff.updated.reduce((n, u) => n + u.changes.length, 0);
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-2" aria-label={`${caption} changes`}>
        <DiffBadge kind="inserted" count={diff.inserted.length} />
        <DiffBadge kind="deleted" count={diff.deleted.length} />
        <DiffBadge kind="changed" count={diff.updated.length} />
        <span className="text-xs text-bone/70">
          {changedCells} changed {changedCells === 1 ? 'cell' : 'cells'}, matched by{' '}
          {diff.key ?? 'record number'}
        </span>
      </div>
      <DbfGrid caption={caption} fields={after.fields} rows={rows} height={height} />
    </div>
  );
}
