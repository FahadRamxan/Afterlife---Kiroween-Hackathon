import type { ScreenGrid } from '@afterlife/screen';
import type { CSSProperties } from 'react';
import { CRTFrame } from './CRTFrame';
import { GhostCursor } from './GhostCursor';
import { cn } from './cn';
import { crtRuns, crtSummary, dosColour, type CrtCell, type CrtSpan } from './crt-screen';

export type CrtScreenProps = {
  /** A decoded text screen (from decodeScreen in @afterlife/screen). */
  grid: ScreenGrid;
  /** Accessible name, for example "Shifa Medical Store, 1998, running live". */
  label: string;
  /** A field the agent is looking at: ringed in ectoplasm. */
  highlight?: (CrtSpan & { label?: string }) | null;
  /** The cell the Possessor is typing into. */
  ghost?: CrtCell | null;
  /** Cells whose data just changed: outlined in candle, with a short pulse. */
  changed?: CrtSpan[];
  className?: string;
};

const place = (row: number, col: number, length = 1): CSSProperties => ({
  left: `${col}ch`,
  top: `calc(${row} * var(--cell-h))`,
  width: `${length}ch`,
  height: 'var(--cell-h)',
});

/**
 * The real legacy app's text screen, live or recorded: a ScreenGrid drawn as text in IBM Plex
 * Mono in its own 16 DOS colours, inside CRTFrame. The text is sized from the frame's width so
 * all 80 columns always fit (at most 14 px). Overlays mark a field, the ghost cursor and changed
 * data; the summary under it says the same in words.
 */
export function CrtScreen({
  grid,
  label,
  highlight,
  ghost,
  changed = [],
  className,
}: CrtScreenProps) {
  const cursor = grid.cursor;
  const cursorColour = cursor ? dosColour(grid.cells[cursor.row]![cursor.col]!.fg) : undefined;
  const summary = crtSummary({ highlight, changed, ghost, cursor });
  return (
    <div className={cn('[container-type:inline-size]', className)}>
      <CRTFrame label={label}>
        <div
          dir="ltr"
          className="relative text-[length:min(14px,calc((100cqi_-_64px)/48.5))] leading-[var(--cell-h)] [font-variant-ligatures:none]"
          // Whole pixels: a fractional row height would blur the text and shift what comes after.
          style={{ '--cell-h': 'round(down, 1.25em, 1px)' } as CSSProperties}
        >
          {grid.cells.map((line, r) => (
            <div key={r} data-crt-row={r} className="h-[var(--cell-h)]">
              {crtRuns(line).map((run) => (
                <span
                  key={run.col}
                  style={{ color: dosColour(run.fg), backgroundColor: dosColour(run.bg) }}
                >
                  {run.text}
                </span>
              ))}
            </div>
          ))}
          {cursor ? (
            <span
              aria-hidden="true"
              data-crt-cursor="true"
              className="pointer-events-none absolute"
              style={{
                left: `${cursor.col}ch`,
                top: `calc(${cursor.row} * var(--cell-h) + 0.8 * var(--cell-h))`,
                width: '1ch',
                height: 'calc(0.12 * var(--cell-h))',
                backgroundColor: cursorColour,
              }}
            />
          ) : null}
          {changed.map((c) => (
            <span
              key={`${c.row}-${c.col}`}
              aria-hidden="true"
              className="data-pulse pointer-events-none absolute rounded-[2px] outline-1 outline-candle outline-solid"
              style={place(c.row, c.col, c.length)}
            />
          ))}
          {highlight ? (
            <span
              aria-hidden="true"
              data-crt-highlight="true"
              className="pointer-events-none absolute rounded-[2px] ring-2 ring-ectoplasm"
              style={place(highlight.row, highlight.col, highlight.length)}
            />
          ) : null}
          {ghost ? <GhostCursor row={ghost.row} col={ghost.col} /> : null}
        </div>
      </CRTFrame>
      {summary ? <p className="sr-only">{summary}</p> : null}
    </div>
  );
}
