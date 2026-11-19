'use client';
import { ScreenWireSchema, fromWire } from '@afterlife/screen';
import { CrtScreen } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { latestScreen, type LiveEvent } from '../lib/live';
import { possessionStats } from '../lib/possession';
import { theaterGraph, theaterObservations, thought } from '../lib/theater';
import { DataChangeCard } from './DataChangeCard';
import { ScreenGraphView } from './ScreenGraphView';
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
  // The Possession Theater (Prompt 51): the graph, the agent's thoughts, the newest data change.
  const graph = useMemo(() => theaterGraph(events), [events]);
  const { thoughts, lastChange } = useMemo(() => {
    const obs = theaterObservations(events);
    return {
      thoughts: obs.slice(-8).map((o) => ({ step: o.step, text: thought(o) })),
      lastChange: obs.filter((o) => o.changed.length).at(-1) ?? null,
    };
  }, [events]);

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
      <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          {grid ? (
            <div data-testid="live-screen" data-seq={screen!.seq}>
              {/* The ghost cursor sits on the cell the Possessor is typing into. */}
              <CrtScreen
                grid={grid}
                label={t('screenLabel', { name })}
                ghost={grid.cursor ? { row: grid.cursor.row, col: grid.cursor.col } : null}
                className="max-w-3xl"
              />
            </div>
          ) : (
            <p className="text-sm text-bone/70">{t('waiting')}</p>
          )}
          <DataChangeCard obs={lastChange} />
        </div>
        <div>
          {stats ? (
            <div data-testid="possession-stats" className="text-sm">
              <h3 className="font-semibold">{t('possession.title')}</h3>
              <ul className="mt-1 flex flex-wrap gap-x-4">
                <li data-testid="stat-screens">{t('possession.screens', { n: stats.screens })}</li>
                <li data-testid="stat-actions">{t('possession.actions', { n: stats.actions })}</li>
                <li
                  data-testid="stat-changes"
                  className={stats.changes ? 'text-candle' : undefined}
                >
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
                  <ul
                    data-testid="possession-refused"
                    className="mt-1 space-y-0.5 font-mono text-xs"
                  >
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
          {graph.nodes.length ? <ScreenGraphView nodes={graph.nodes} edges={graph.edges} /> : null}
          {thoughts.length ? (
            <section aria-labelledby="thoughts-heading" className="mt-3">
              <h3 id="thoughts-heading" className="text-sm font-semibold">
                {t('theater.thinking')}
              </h3>
              {/* The newest line is read out as it comes. */}
              <ol
                data-testid="thoughts"
                aria-live="polite"
                className="mt-1 space-y-0.5 text-xs"
                lang="en"
                dir="ltr"
              >
                {thoughts.map((x) => (
                  <li
                    key={x.step}
                    className={x.step === thoughts.at(-1)!.step ? 'text-ectoplasm' : 'text-bone/75'}
                  >
                    {x.text}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      </div>
      {lines.length ? (
        <ol data-testid="live-log" className="mt-3 space-y-1 font-mono text-xs">
          {lines.map((e) => (
            <li key={e.seq} data-type={e.type}>
              {e.type === 'step' ? (
                <StepLine
                  p={e.payload as StepPayload}
                  state={(s) => (t.has(`state.${s}`) ? t(`state.${s}`) : s)}
                />
              ) : (
                // The worker writes its log in English.
                <span lang="en" dir="ltr">
                  {(e.payload as LogPayload).message}
                </span>
              )}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

/** "possess: done": the step's id (English, as the API names it), then its state in the page's language. */
function StepLine({ p, state }: { p: StepPayload; state: (s: string) => string }) {
  return (
    <>
      <span lang="en" dir="ltr">
        {p.step}
      </span>
      : {state(p.state)}
      {p.message ? (
        <span lang="en" dir="ltr">
          {' '}
          ({p.message})
        </span>
      ) : null}
    </>
  );
}
