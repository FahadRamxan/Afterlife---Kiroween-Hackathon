import { cn } from './cn';

export type DiffKind = 'inserted' | 'deleted' | 'changed' | 'same';

/** Colours carry meaning everywhere: teal = new data, red = removed or different, amber = changed. */
export const diffStyles: Record<DiffKind, { label: string; className: string }> = {
  inserted: { label: 'Inserted', className: 'bg-ectoplasm text-graveyard' },
  deleted: { label: 'Deleted', className: 'bg-blood text-graveyard line-through' },
  changed: { label: 'Changed', className: 'bg-candle text-graveyard' },
  same: { label: 'No change', className: 'bg-bone text-graveyard' },
};

export type DiffBadgeProps = {
  kind: DiffKind;
  count?: number;
  /** Words for the kind in this place ("Difference" in a proof); the colour stays the kind's. */
  label?: string;
  className?: string;
};

export function DiffBadge({ kind, count, label, className }: DiffBadgeProps) {
  const s = diffStyles[kind];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold',
        s.className,
        className,
      )}
    >
      {label ?? s.label}
      {count !== undefined ? <span>{count}</span> : null}
    </span>
  );
}
