import type { ReactNode } from 'react';
import { cn } from './cn';

export type CRTFrameProps = {
  /** Accessible name, for example "Shifa Medical Store, 1998, running live". */
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * Frames the original legacy app. The scanlines and phosphor glow mean "this is the real old
 * program running live", never the reborn app. Animations stop under prefers-reduced-motion.
 */
export function CRTFrame({ label, children, className }: CRTFrameProps) {
  return (
    <section
      aria-label={label}
      className={cn(
        'rounded-2xl border-4 border-[#1c211d] bg-[#111611] p-3 shadow-[0_0_40px_rgb(51_255_102/0.12)]',
        className,
      )}
    >
      {/* dir="ltr": a DOS screen is always left to right. On the Urdu (right-to-left) page the
          bidi algorithm otherwise turns "1  New Bill" into "New Bill  1" and "Choice:" into
          ":Choice". */}
      <div
        dir="ltr"
        className="relative overflow-hidden rounded-lg bg-black p-4 font-mono text-phosphor"
      >
        <div className="crt-glow relative whitespace-pre">{children}</div>
        <div aria-hidden="true" className="crt-scanlines pointer-events-none absolute inset-0" />
      </div>
    </section>
  );
}
