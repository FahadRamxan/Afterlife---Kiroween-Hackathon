import type { ReactNode } from 'react';
import { cn } from './cn';

export type CertificateFrameProps = { title: string; children: ReactNode; className?: string };

/** Bone paper and a wax seal: the signed proof that the old and new apps behave the same. */
export function CertificateFrame({ title, children, className }: CertificateFrameProps) {
  return (
    <article
      className={cn(
        'relative rounded-sm border-4 border-double border-candle bg-bone p-8 text-graveyard shadow-xl',
        className,
      )}
    >
      <h2 className="text-center font-serif text-2xl tracking-wide uppercase">{title}</h2>
      <div className="mt-4">{children}</div>
      <div
        data-seal
        aria-hidden="true"
        className="absolute right-6 bottom-6 flex size-14 items-center justify-center rounded-full bg-blood font-serif text-xl font-bold text-bone shadow-inner"
      >
        A
      </div>
    </article>
  );
}
