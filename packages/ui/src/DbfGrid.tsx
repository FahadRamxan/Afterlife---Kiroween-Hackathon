'use client';

import type { DbfField } from '@afterlife/dbf';
import { tableFeatures, useTable, type ColumnDef } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from './cn';
import {
  columnWidth,
  fieldLabel,
  formatValue,
  gridKey,
  isNumeric,
  moveCell,
  type GridRow,
  type RowKind,
} from './dbf-grid';

const ROW_H = 32;
const features = tableFeatures({});

const ROW_STYLE: Record<RowKind, string> = {
  same: '',
  changed: '',
  inserted: 'bg-ectoplasm/15 shadow-[inset_3px_0_0_var(--color-ectoplasm)]',
  deleted: 'bg-blood/15 text-bone/70 line-through shadow-[inset_3px_0_0_var(--color-blood)]',
};

export type DbfGridProps = {
  /** Accessible name, usually the file name. */
  caption: string;
  fields: DbfField[];
  rows: GridRow[];
  /** Visible height of the scroll area, in pixels. */
  height?: number;
  className?: string;
};

/**
 * A virtualised, keyboard-navigable ARIA grid of .DBF records (TanStack Table + TanStack Virtual).
 * Only the visible rows are in the DOM; aria-rowcount and aria-rowindex give the full picture.
 * Keys: arrows, Home/End (row start/end), PageUp/PageDown (10 rows), Ctrl+Home/Ctrl+End.
 */
export function DbfGrid({ caption, fields, rows, height = 320, className }: DbfGridProps) {
  const uid = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState({ row: 0, col: 0 });
  const wantFocus = useRef(false);

  const columns = useMemo<ColumnDef<typeof features, GridRow>[]>(
    () => [
      { id: '#', header: '#', accessorFn: (r) => String(r.recno + 1) },
      ...fields.map((f) => ({
        id: f.name,
        header: f.name,
        accessorFn: (r: GridRow) => formatValue(f, r.values[f.name] ?? null),
      })),
    ],
    [fields],
  );
  const table = useTable({ features, columns, data: rows });
  const tableRows = table.getRowModel().rows;
  const colCount = columns.length;
  const template = ['6ch', ...fields.map((f) => `${columnWidth(f)}ch`)].join(' ');

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 6,
    // Room for the sticky header row, so rows are not hidden under it.
    paddingStart: ROW_H,
    scrollPaddingStart: ROW_H,
    // Lets the server render the first screen of rows.
    initialRect: { width: 800, height },
  });

  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    virtualizer.scrollToIndex(active.row, { align: 'auto' });
    // The row may only exist after the virtualiser re-renders.
    const id = requestAnimationFrame(() => {
      const el = gridRef.current?.querySelector<HTMLElement>(
        `[data-cell="${active.row}-${active.col}"]`,
      );
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    return () => cancelAnimationFrame(id);
  }, [active, virtualizer]);

  function onKeyDown(e: KeyboardEvent) {
    const k = gridKey(e);
    if (!k || tableRows.length === 0) return;
    e.preventDefault();
    wantFocus.current = true;
    setActive((a) => moveCell(a, k, { rows: tableRows.length, cols: colCount }));
  }

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label={caption}
      aria-rowcount={tableRows.length + 1}
      aria-colcount={colCount}
      onKeyDown={onKeyDown}
      className={cn('rounded-lg border border-bone/15 font-mono text-sm text-bone', className)}
    >
      <div
        ref={scrollRef}
        className="relative overflow-auto"
        style={{ height, scrollPaddingTop: ROW_H }}
      >
        <div
          className="relative"
          style={{ height: virtualizer.getTotalSize(), minWidth: 'max-content' }}
        >
          <div role="rowgroup" className="sticky top-0 z-10 bg-[#121813]">
            {table.getHeaderGroups().map((group) => (
              <div
                key={group.id}
                role="row"
                aria-rowindex={1}
                className="grid"
                style={{ gridTemplateColumns: template, height: ROW_H }}
              >
                {group.headers.map((h, i) => {
                  const f = i === 0 ? undefined : fields[i - 1];
                  return (
                    <div
                      key={h.id}
                      role="columnheader"
                      aria-colindex={i + 1}
                      className={cn(
                        'flex items-center gap-1.5 border-b border-bone/15 px-2 text-xs font-semibold',
                        f && isNumeric(f) && 'justify-end',
                      )}
                    >
                      <table.FlexRender header={h} />
                      {f ? <span className="font-normal text-candle">{fieldLabel(f)}</span> : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div role="rowgroup">
            {virtualizer.getVirtualItems().map((item) => {
              const row = tableRows[item.index]!;
              const data = row.original;
              return (
                <div
                  key={row.id}
                  role="row"
                  aria-rowindex={item.index + 2}
                  data-kind={data.kind}
                  className={cn(
                    // top-0: without it the row is first placed below the header, then
                    // translateY moves it again, which left an empty row.
                    'absolute inset-x-0 top-0 grid border-b border-bone/5',
                    // Each row is its own stacking context (transform), so the row with the open
                    // tooltip must be raised above the rows painted after it.
                    'hover:z-20 focus-within:z-20',
                    ROW_STYLE[data.kind],
                  )}
                  style={{
                    gridTemplateColumns: template,
                    height: ROW_H,
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  {row.getAllCells().map((cell, c) => {
                    const f = c === 0 ? undefined : fields[c - 1];
                    const change = f ? data.changes[f.name] : undefined;
                    const isActive = active.row === item.index && active.col === c;
                    const tipId = `${uid}-tip-${item.index}-${c}`;
                    return (
                      <div
                        key={cell.id}
                        role={c === 0 ? 'rowheader' : 'gridcell'}
                        aria-colindex={c + 1}
                        data-cell={`${item.index}-${c}`}
                        tabIndex={isActive ? 0 : -1}
                        aria-describedby={change ? tipId : undefined}
                        onClick={() => setActive({ row: item.index, col: c })}
                        className={cn(
                          'group relative flex items-center overflow-visible whitespace-pre px-2 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ectoplasm',
                          c === 0 && 'justify-end text-xs text-bone/70',
                          f && isNumeric(f) && 'justify-end text-right',
                          change && 'bg-candle/20 text-candle',
                        )}
                      >
                        {c === 0 && data.kind !== 'same' ? (
                          <span className="sr-only">{data.kind} </span>
                        ) : null}
                        <table.FlexRender cell={cell} />
                        {change && f ? (
                          // aria-hidden keeps the tooltip out of the cell's name ("236"); aria-describedby
                          // still reads it as the cell's description ("240 → 236").
                          <span
                            role="tooltip"
                            aria-hidden="true"
                            id={tipId}
                            className="pointer-events-none absolute top-1/2 right-full z-20 mr-1 hidden -translate-y-1/2 rounded bg-graveyard px-2 py-1 text-xs whitespace-nowrap text-candle shadow-lg ring-1 ring-candle/40 group-hover:block group-focus:block"
                          >
                            {formatValue(f, change.before)} → {formatValue(f, change.after)}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
