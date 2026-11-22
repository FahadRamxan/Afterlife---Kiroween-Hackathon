'use client';
import { Button, Card, Tombstone, motion as timing } from '@afterlife/ui';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export type Reborn = { url: string; actions: { id: string; name: string }[] };

/**
 * The reborn moment (Prompt 63): when the Surgeon has published the app, the tombstone cracks and
 * sinks, and the app's card rises with the link. It means the old app is reborn: the motion only
 * happens once, when the step finishes; under reduced motion the card is simply there.
 */
export function RebornCard({
  reborn,
  app,
}: {
  reborn: Reborn;
  /** The dead app's tombstone (a Graveyard app); an upload has none to crack. */
  app?: { name: string; born: number; died: number };
}) {
  const t = useTranslations('raise.reborn');
  const still = useReducedMotion();
  const slow = timing.slow / 1000;
  // The tombstone shows first, then cracks; the card rises after it.
  const [cracked, setCracked] = useState(!app || !!still);
  useEffect(() => {
    if (cracked) return;
    const id = setTimeout(() => setCracked(true), timing.slow * 2);
    return () => clearTimeout(id);
  }, [cracked]);
  return (
    <section
      aria-labelledby="reborn-title"
      data-testid="reborn"
      data-cracked={cracked}
      className="relative mt-6 max-w-md"
    >
      <h2 id="reborn-title" className="mb-2 text-lg font-semibold text-ectoplasm">
        {t('title')}
      </h2>
      <AnimatePresence mode="wait" initial={!still}>
        {!cracked && app ? (
          <motion.div
            key="tombstone"
            data-testid="reborn-tombstone"
            aria-hidden="true"
            exit={{ y: 24, opacity: 0, transition: { duration: slow } }}
            className="relative"
          >
            <Tombstone name={app.name} nameLang="en" born={app.born} died={app.died} />
            {/* The crack, drawn down the stone. */}
            <svg
              viewBox="0 0 100 160"
              className="pointer-events-none absolute inset-0 h-full w-full"
              preserveAspectRatio="none"
            >
              <motion.path
                d="M52 8 L46 40 L56 62 L44 92 L54 118 L48 152"
                fill="none"
                stroke="var(--color-candle)"
                strokeWidth="1.5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: slow * 1.5, ease: 'easeIn' }}
              />
            </svg>
          </motion.div>
        ) : (
          <motion.div
            key="card"
            initial={still ? false : { y: 48, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ duration: slow, ease: 'easeOut' }}
          >
            <Card data-testid="reborn-card" className="space-y-3 border-ectoplasm/50 p-4">
              <p className="text-sm text-bone/85">{t('published', { n: reborn.actions.length })}</p>
              <ul className="list-inside list-disc text-sm" lang="en" dir="ltr">
                {reborn.actions.map((a) => (
                  <li key={a.id}>{a.name}</li>
                ))}
              </ul>
              <Button asChild>
                <Link href={reborn.url}>{t('open')}</Link>
              </Button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
