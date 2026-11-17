import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type TombstoneProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  name: string;
  /** Language of the name, when it differs from the page (English app names on the Urdu page). */
  nameLang?: string;
  born: number;
  died: number;
  /** Era story or other details. */
  children?: ReactNode;
  /** Actions, for example the Raise button. */
  actions?: ReactNode;
  className?: string;
};

/** A dead app in the Graveyard. The arch shape means "this software is dead and can be raised". */
export function Tombstone({
  name,
  nameLang,
  born,
  died,
  children,
  actions,
  className,
  ...rest
}: TombstoneProps) {
  return (
    <article
      {...rest}
      className={cn(
        'flex flex-col items-center gap-3 rounded-t-full border border-bone/25 bg-gradient-to-b from-[#1b201c] to-graveyard px-6 pt-14 pb-6 text-center text-bone',
        className,
      )}
    >
      {/* dir="ltr": inside an Urdu (right-to-left) page, "1998–2004" must not become "2004–1998". */}
      <p dir="ltr" className="font-mono text-xs tracking-[0.3em] text-bone/70">
        R.I.P.
      </p>
      <h3 lang={nameLang} dir={nameLang ? 'ltr' : undefined} className="text-lg font-semibold">
        {name}
      </h3>
      <p dir="ltr" className="font-mono text-sm text-candle">
        {born}–{died}
      </p>
      {children ? <div className="text-sm text-bone/80">{children}</div> : null}
      {actions ? <div className="mt-2">{actions}</div> : null}
    </article>
  );
}
