'use client';
import { DbfDiffView } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { getObservation } from '../lib/soul-client';
import { diffCards, type DiffCard, type TheaterObservation } from '../lib/theater';

const API = process.env.NEXT_PUBLIC_API_URL;

/**
 * The newest action that changed the old app's data, as DbfDiffView cards: the records it
 * inserted, deleted and changed. A pulse flies from the screen into it when data changes.
 */
export function DataChangeCard({ obs }: { obs: TheaterObservation | null }) {
  const t = useTranslations('raise.live.theater');
  const [cards, setCards] = useState<DiffCard[] | null>(null);
  const id = obs?.id;
  const sent = obs?.diff;
  useEffect(() => {
    let alive = true;
    setCards(null);
    // The worker sends the diff with the event; older events only have the stored row's id.
    if (sent) {
      setCards(diffCards(sent));
      return;
    }
    if (!API || !id) return;
    getObservation(API, id).then((o) => {
      if (alive && o) setCards(diffCards(o.dbfDiff));
    });
    return () => {
      alive = false;
    };
  }, [id, sent]);
  if (!obs) return null;
  return (
    <section
      data-testid="data-change"
      data-step={obs.step}
      aria-labelledby="data-change-heading"
      className="relative mt-3 rounded-md border border-candle/40 p-3"
    >
      {/* Data moved: from the screen above into this card. Stops under reduced motion. */}
      <span
        key={obs.step}
        aria-hidden="true"
        className="data-fly pointer-events-none absolute left-1/2 top-0 size-3 rounded-sm bg-candle"
      />
      <h3 id="data-change-heading" className="text-sm font-semibold">
        {t('changed', { step: obs.step })}{' '}
        <span lang="en" dir="ltr" className="font-mono text-candle">
          {obs.changed.join(', ')}
        </span>
      </h3>
      <p className="mt-1 text-xs text-bone/70">{t('onlyChanged')}</p>
      {cards
        ? cards.map((c) => (
            <DbfDiffView
              key={c.caption}
              caption={c.caption}
              before={c.before}
              after={c.after}
              diff={c.diff}
              height={Math.min(220, 36 + 28 * (c.after.records.length + c.diff.deleted.length))}
              className="mt-2"
            />
          ))
        : null}
    </section>
  );
}
