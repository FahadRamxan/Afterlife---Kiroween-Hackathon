import { cn } from './cn';

export type GhostCursorProps = {
  /** Text column (0-based) in an 80x25 grid. */
  col: number;
  /** Text row (0-based). */
  row: number;
  className?: string;
};

/**
 * Marks the cell the Possessor is typing into. Place it inside a relatively positioned text grid
 * that sets --cell-h. Decorative, so it is hidden from screen readers (the log says the same thing).
 */
export function GhostCursor({ col, row, className }: GhostCursorProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'ghost-cursor pointer-events-none absolute animate-ghost-pulse rounded-[2px] bg-ectoplasm/40',
        className,
      )}
      style={{
        left: `${col}ch`,
        top: `calc(${row} * var(--cell-h, 1.25em))`,
        width: '1ch',
        height: 'var(--cell-h, 1.25em)',
      }}
    />
  );
}
