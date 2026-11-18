'use client';
import { ScreenWireSchema, fromWire } from '@afterlife/screen';
import { CrtScreen } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { latestScreen, type LiveEvent } from '../lib/live';
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
