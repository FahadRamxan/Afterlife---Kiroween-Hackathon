'use client';
import { Button, cn, motion as timing } from '@afterlife/ui';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { decideExorcism, getExorcisms, sinceText, type ExorcismFinding } from '../lib/exorcism';
import type { LiveEvent } from '../lib/live';
import { EmptyState } from './EmptyState';

const API = process.env.NEXT_PUBLIC_API_URL;

/**
 * The Exorcism tab (Prompt 75): each legacy bug the Exorcist found is a ghost card: its title and
 * severity, what it does in English and Urdu, the evidence (the old app's own screen where it
 * showed it), since when, and Keep or Fix. Fixing dissolves the ghost (not under reduced motion);
 * the count of ghosts left follows.
 */
export function ExorcismTab({ projectId, events }: { projectId: string; events: LiveEvent[] }) {
  const t = useTranslations('raise.exorcism');
  const still = useReducedMotion();
  // Read again whenever the Exorcist reports or its step starts or ends.
  const beats = useMemo(
    () =>
      events.filter(
        (e) =>
          e.type === 'exorcism' ||
          (e.type === 'step' && (e.payload as { step?: string })?.step === 'exorcise'),
      ).length,
    [events],
  );
  const [state, setState] = useState<{ findings: ExorcismFinding[]; remaining: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    getExorcisms(API, projectId).then((r) => {
      if (!alive) return;
      if (r.ok) setState({ findings: r.findings, remaining: r.remaining });
      else setError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [projectId, beats, version]);

  async function choose(f: ExorcismFinding, decision: 'keep' | 'fix') {
    setBusy(f.code);
    setError(null);
    const r = await decideExorcism(API, projectId, f.code, decision);
    setBusy(null);
    if (!r.ok) return setError(r.message);
    setNotice(
      r.proving
        ? t('proving', { version: r.soulVersion })
        : decision === 'keep'
          ? t('keptSame')
          : t('fixedSame'),
    );
    setVersion((v) => v + 1);
  }

  if (!state) return error ? <p role="alert">{error}</p> : null;
  if (!state.findings.length) return <EmptyState body={t('none')} />;
  const ghosts = state.findings.filter((f) => f.decision === 'pending');
  const settled = state.findings.filter((f) => f.decision !== 'pending');
  return (
    <section aria-labelledby="exorcism-title" data-testid="exorcism" className="mt-6 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="exorcism-title" className="text-lg font-semibold">
          {t('title')}
        </h3>
        <p data-testid="ghosts-left" aria-live="polite" className="font-mono text-candle">
          {t('left', { n: state.remaining })}
        </p>
      </div>
      {notice ? (
        <p role="status" data-testid="exorcism-notice" className="text-sm text-ectoplasm">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-blood">
          {error}
        </p>
      ) : null}
      <ul className="space-y-4">
        <AnimatePresence initial={false}>
          {ghosts.map((f) => (
            <motion.li
              key={f.code}
              layout={!still}
              {...(still
                ? {}
                : {
                    // The ghost dissolves: it fades, blurs and rises away.
                    exit: { opacity: 0, y: -24, filter: 'blur(8px)', scale: 0.96 },
                    transition: { duration: timing.slow / 1000 },
                  })}
              data-testid="ghost-card"
              data-code={f.code}
              className="rounded-xl border border-blood/60 bg-bone/[0.03] p-4"
            >
              <Card f={f} />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  size="lg"
                  disabled={busy !== null}
                  onClick={() => choose(f, 'keep')}
                >
                  {t('keep')}
                </Button>
                <Button
                  variant="danger"
                  size="lg"
                  disabled={busy !== null || !f.fixable}
                  onClick={() => choose(f, 'fix')}
                >
                  {t('fix')}
                </Button>
                <span className="text-sm text-bone/70">
                  {f.fixable ? (
                    <>
                      {t('fixWill')}{' '}
                      <span lang="en" dir="ltr">
                        {f.fixEn}
                      </span>
                    </>
                  ) : (
                    <span lang="en" dir="ltr">
                      {f.why}
                    </span>
                  )}
                </span>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {settled.length ? (
        <div>
          <h4 className="mb-2 text-sm font-semibold">{t('settled')}</h4>
          <ul className="space-y-2">
            {settled.map((f) => (
              <li
                key={f.code}
                data-testid="settled-card"
                data-code={f.code}
                data-decision={f.decision}
                className="rounded-lg border border-bone/15 p-3 text-sm"
              >
                <span
                  className={cn(
                    'font-semibold',
                    f.decision === 'fix' ? 'text-ectoplasm' : 'text-bone',
                  )}
                >
                  {f.decision === 'fix' ? t('exorcised') : t('kept')}
                </span>{' '}
                <span lang="en" dir="ltr">
                  {f.titleEn}
                </span>
                {f.decision === 'fix' ? (
                  <span className="block text-bone/70">
                    {t('fixWas')}{' '}
                    <span lang="en" dir="ltr">
                      {f.fixEn}
                    </span>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** What one ghost is: title, severity, since when, English and Urdu, and its evidence. */
function Card({ f }: { f: ExorcismFinding }) {
  const t = useTranslations('raise.exorcism');
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="ghost-severity"
          className="rounded-full bg-blood px-2.5 py-0.5 font-mono text-xs font-semibold text-graveyard uppercase"
        >
          {t(`severity.${f.severity}`)}
        </span>
        <h4 lang="en" dir="ltr" className="text-base font-semibold text-bone">
          {f.titleEn}
        </h4>
        {f.since ? (
          <span data-testid="ghost-since" className="font-mono text-sm text-candle">
            {sinceText(f.since)}
          </span>
        ) : null}
      </div>
      <p lang="ur" dir="rtl" className="mt-1 font-urdu leading-loose text-bone/90">
        {f.titleUr}
      </p>
      <p lang="en" dir="ltr" className="mt-2 text-bone">
        {f.en}
      </p>
      <p lang="ur" dir="rtl" className="mt-1 font-urdu leading-loose text-bone/90">
        {f.ur}
      </p>
      <details className="mt-3" data-testid="ghost-evidence">
        <summary className="cursor-pointer text-sm text-ectoplasm">
          {t('evidence', { n: f.evidence.length })}
        </summary>
        <ul className="mt-2 space-y-2">
          {f.evidence.map((e, i) => (
            <li key={i} className="text-sm">
              <span className="text-bone/70">{t(`kind.${e.kind}`)}</span>{' '}
              <span lang="en" dir="ltr" className="font-mono text-bone">
                {e.text}
              </span>
              {e.screen ? (
                <pre
                  lang="en"
                  dir="ltr"
                  data-testid="evidence-screen"
                  aria-label={t('screen')}
                  className="mt-1 overflow-x-auto rounded bg-black p-2 font-mono text-xs leading-tight text-phosphor"
                >
                  {e.screen.join('\n')}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
