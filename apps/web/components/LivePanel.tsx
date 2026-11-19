'use client';
import { ScreenWireSchema, fromWire } from '@afterlife/screen';
import { CrtScreen } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { latestScreen, type LiveEvent } from '../lib/live';
import { possessionStats } from '../lib/possession';
import type { LiveStatus } from '../lib/use-project-live';

type StepPayload = { step: string; state: string; attempt: number; message?: string };
type LogPayload = { level: string; message: string };

/** What the worker is doing on this project, live: the old app's screen and the step log. */
export function LivePanel({
  events,
  status,
  name,
}: {
  events: LiveEvent[];
  status: LiveStatus;
  name: string;
}) {
  const t = useTranslations('raise.live');
  const screen = latestScreen(events);
  const grid = useMemo(() => {
    const w = ScreenWireSchema.safeParse((screen?.payload as { grid?: unknown } | undefined)?.grid);
    return w.success ? fromWire(w.data) : null;
  }, [screen]);
  const lines = events.filter((e) => e.type === 'step' || e.type === 'log').slice(-8);
  const stats = useMemo(() => possessionStats(events), [events]);

  return (
    <section aria-labelledby="live-heading" data-testid="live-panel" className="mt-6">
      <div className="flex items-center gap-3">
        <h2 id="live-heading" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p
          role="status"
          data-testid="live-status"
          data-status={status}
          className="text-sm text-bone/70"
        >
          {t(`status.${status satisfies LiveStatus}`)}
        </p>
      </div>
      {grid ? (
        <div data-testid="live-screen" data-seq={screen!.seq} className="mt-3">
          <CrtScreen grid={grid} label={t('screenLabel', { name })} className="max-w-3xl" />
        </div>
      ) : (
        <p className="mt-3 text-sm text-bone/70">{t('waiting')}</p>
      )}
      {stats ? (
        <div data-testid="possession-stats" className="mt-3 text-sm">
          <h3 className="font-semibold">{t('possession.title')}</h3>
          <ul className="mt-1 flex flex-wrap gap-x-4">
            <li data-testid="stat-screens">{t('possession.screens', { n: stats.screens })}</li>
            <li data-testid="stat-actions">{t('possession.actions', { n: stats.actions })}</li>
            <li data-testid="stat-changes" className={stats.changes ? 'text-candle' : undefined}>
              {t('possession.changes', { n: stats.changes })}
            </li>
            {stats.guided ? (
              <li data-testid="stat-guided" className="text-ectoplasm">
                {t('possession.guided', { n: stats.guided })}
              </li>
            ) : null}
          </ul>
          {stats.hints.length ? (
            <>
              <h4 className="mt-2 font-semibold">{t('possession.hints')}</h4>
              <ul data-testid="possession-hints" className="mt-1 space-y-0.5 text-xs">
                {stats.hints.map((h) => (
                  <li key={h.step}>
                    <q dir="auto">{h.hint}</q>
                    <span className="font-mono text-bone/70" lang="en" dir="ltr">
                      {' '}
                      ← {h.step}. {h.label}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <h4 className="sr-only">{t('possession.recent')}</h4>
          <ol data-testid="possession-steps" className="mt-1 space-y-0.5 font-mono text-xs">
            {stats.recent.map((o) => (
              <li key={o.step} lang="en" dir="ltr" data-kind={o.kind}>
                {o.step}. {o.label} → {o.to}
                {o.kind === 'guide' ? (
                  <span className="text-ectoplasm"> · {t('possession.ownerPath')}</span>
                ) : null}
                {o.newScreen ? (
                  <span className="text-ectoplasm"> · {t('possession.newScreen')}</span>
                ) : null}
                {o.changed.length ? (
                  <span className="text-candle">
                    {' '}
                    · {t('possession.changed', { files: o.changed.join(', ') })}
                  </span>
                ) : null}
                {o.errors.length ? <span> · {o.errors.join('; ')}</span> : null}
              </li>
            ))}
          </ol>
          {stats.refused.length ? (
            <>
              <h4 className="mt-2 font-semibold">{t('possession.refused')}</h4>
              <ul data-testid="possession-refused" className="mt-1 space-y-0.5 font-mono text-xs">
                {stats.refused.map((x) => (
                  <li key={x.text} lang="en" dir="ltr">
                    <span className="text-phosphor">{x.text}</span>
                    <span className="text-bone/70"> ← {x.label}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
      {lines.length ? (
        <ol data-testid="live-log" className="mt-3 space-y-1 font-mono text-xs" lang="en" dir="ltr">
          {lines.map((e) => (
            <li key={e.seq} data-type={e.type}>
              {describe(e)}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function describe(e: LiveEvent): string {
  if (e.type === 'step') {
    const p = e.payload as StepPayload;
    return `${p.step}: ${p.state}${p.message ? ` (${p.message})` : ''}`;
  }
  return (e.payload as LogPayload).message;
}
