import { MARK } from '@afterlife/ui';

/**
 * The Afterlife mark: a tombstone arch with a DOS cursor inside it (the dead app, running again).
 * The same shapes as the favicon and the README banner (packages/ui/src/brand.ts), in the theme's
 * colours.
 */
export function LogoMark({ className }: { className?: string }) {
  const line = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <path
        d={MARK.arch.d}
        stroke="var(--color-bone)"
        strokeWidth={MARK.arch.strokeWidth}
        {...line}
      />
      <path
        d={MARK.ground.d}
        stroke="var(--color-bone)"
        strokeWidth={MARK.ground.strokeWidth}
        {...line}
      />
      <rect {...MARK.cursor} fill="var(--color-ectoplasm)" />
    </svg>
  );
}
