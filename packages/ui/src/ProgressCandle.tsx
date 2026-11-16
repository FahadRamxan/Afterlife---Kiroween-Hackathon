import { cn } from './cn';

/** Percent of work done, clamped to 0..100. A missing or non-positive max counts as 0%. */
export function candlePercent(value: number, max: number): number {
  if (!(max > 0) || Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

export type ProgressCandleProps = {
  value: number;
  max: number;
  /** Accessible name, for example "Proof cases". */
  label: string;
  className?: string;
};

/** A candle that burns down as the work completes. The flame stops flickering under reduced motion. */
export function ProgressCandle({ value, max, label, className }: ProgressCandleProps) {
  const pct = candlePercent(value, max);
  const fmt = new Intl.NumberFormat('en-US');
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('inline-flex flex-col items-center gap-2 text-bone', className)}
    >
      <div className="relative flex h-32 w-8 flex-col justify-end">
        <span
          aria-hidden="true"
          className="candle-flame mx-auto mb-1 block h-4 w-2.5 animate-flame rounded-full bg-candle shadow-[0_0_12px_4px_rgb(245_181_68/0.6)]"
        />
        <span
          aria-hidden="true"
          className="block w-full rounded-t-sm bg-bone transition-[height] duration-300"
          style={{ height: `${100 - pct}%` }}
        />
      </div>
      <span className="font-mono text-xs">
        {fmt.format(value)} / {fmt.format(max)}
      </span>
    </div>
  );
}
