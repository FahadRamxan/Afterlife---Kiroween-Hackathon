'use client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { findApp } from '../lib/graveyard';
import { getProject, type Failure, type Project, type TimelineEvent } from '../lib/projects';
import type { RaiseTab } from '../lib/raise-tabs';
import { useProjectLive } from '../lib/use-project-live';
import { LivePanel } from './LivePanel';
import { PageShell } from './PageShell';
import { RaiseTabs } from './RaiseTabs';
import { SeanceRecorder } from './SeanceRecorder';
import { ShowYourWork } from './ShowYourWork';
import { SoulPanel } from './SoulPanel';
import { StepsList } from './StepsList';

const API = process.env.NEXT_PUBLIC_API_URL;

type State =
  | { phase: 'loading' }
  | { phase: 'ready'; project: Project; events: TimelineEvent[] }
  | { phase: 'failed'; failure: Failure };

/** /raise/<project id>: the project from the API, its timeline, and the rebirth steps. */
export function ProjectRaise({ id, initial }: { id: string; initial: RaiseTab }) {
  const t = useTranslations('raise');
  const [state, setState] = useState<State>({ phase: 'loading' });
  // Opened at once, so the first screen is not missed while the project loads.
  const live = useProjectLive(id);

  // Bumped after a séance is saved, so its timeline shows "Séance recorded" at once.
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    let alive = true;
    getProject(API, id).then((r) => {
      if (!alive) return;
      setState(
        r.ok
          ? { phase: 'ready', project: r.project, events: r.events }
          : { phase: 'failed', failure: r },
      );
    });
    return () => {
      alive = false;
    };
  }, [id, version]);

  if (state.phase === 'loading')
    return (
      <PageShell title={t('project.loading')}>
        <p role="status" className="mt-4 text-bone/70">
          {t('project.loading')}
        </p>
      </PageShell>
    );
  if (state.phase === 'failed')
    return (
      <PageShell title={t('project.failedTitle')}>
        <p role="alert" data-testid="project-error" className="mt-4">
          {t(`project.failed.${state.failure.reason}`)}
          {'message' in state.failure ? ` ${state.failure.message}` : ''}
        </p>
      </PageShell>
    );

  const { project, events } = state;
  // Uploaded apps get their bundle in Prompt 40; until then only Graveyard apps are raised.
  const app = project.source === 'graveyard' ? findApp(project.sourceApp) : undefined;
  // Once possession has begun, its tab shows it: the "has not taken over yet" note goes.
  const possessing = live.events.some(
    (e) =>
      e.type === 'observation' ||
      (e.type === 'step' &&
        (e.payload as { step?: string; state?: string })?.step === 'possess' &&
        ['started', 'done'].includes((e.payload as { state?: string }).state ?? '')),
  );
  return (
    <PageShell title={t('title', { name: project.name })}>
      <p className="mt-2 text-sm text-bone/70">
        {t('project.label')}{' '}
        <code data-testid="project-id" lang="en" dir="ltr" className="font-mono text-bone">
          {project.id}
        </code>
      </p>
      {project.dosTime || app?.dosTime ? (
        <p data-testid="dos-clock" className="mt-1 text-sm text-bone/70">
          {t('project.dosClock')}{' '}
          <time lang="en" dir="ltr" className="font-mono text-candle">
            {project.dosTime ?? app?.dosTime}
          </time>
        </p>
      ) : null}
      {project.mode === 'recorded' ? (
        <p
          data-testid="run-mode"
          data-mode="recorded"
          className="mt-2 inline-block rounded-md border border-bone/30 px-2 py-1 text-sm"
        >
          {t('project.recorded')}
        </p>
      ) : null}
      <StepsList projectId={project.id} events={live.events} />
      <section aria-labelledby="timeline-heading" className="mt-4">
        <h2 id="timeline-heading" className="text-sm font-semibold">
          {t('project.timeline')}
        </h2>
        <ol data-testid="timeline" className="mt-1 space-y-1 text-sm">
          {events.map((e) => (
            <li key={`${e.kind}-${e.id}`} data-kind={e.kind}>
              <time dateTime={e.at} lang="en" dir="ltr" className="font-mono text-candle">
                {e.at.slice(0, 19).replace('T', ' ')}
              </time>{' '}
              {t.has(`project.events.${e.kind}`) ? t(`project.events.${e.kind}`) : e.kind}
              <span lang="en" dir="ltr" className="text-bone/70">
                {' '}
                · {e.summary}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <RaiseTabs
        initial={initial}
        ownEmpty={possessing ? ['soul', 'possession'] : ['soul']}
        panels={
          app
            ? {
                soul: (
                  <SoulPanel
                    projectId={project.id}
                    events={live.events}
                    app={{ bundle: app.bundle, dosTime: app.dosTime }}
                  />
                ),
                possession: (
                  <>
                    <LivePanel events={live.events} status={live.status} name={app.name} />
                    <SeanceRecorder
                      projectId={app.id}
                      bundle={app.bundle}
                      name={app.name}
                      dosTime={app.dosTime}
                      raisedProjectId={project.id}
                      onSaved={refresh}
                    />
                  </>
                ),
              }
            : project.source === 'upload'
              ? {
                  soul: <SoulPanel projectId={project.id} events={live.events} />,
                  // An uploaded app: the virus scan, then possession, live. (Séances on uploads later.)
                  possession: (
                    <LivePanel events={live.events} status={live.status} name={project.name} />
                  ),
                }
              : {}
        }
      />
      <ShowYourWork projectId={project.id} events={live.events} />
    </PageShell>
  );
}
