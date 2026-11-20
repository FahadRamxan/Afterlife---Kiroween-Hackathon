'use client';
import type { Soul } from '@afterlife/soul';
import { cn } from '@afterlife/ui';
import { createVessel, type Vessel } from '@afterlife/vessel';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { findApp } from '../lib/graveyard';
import { getProject } from '../lib/projects';
import { getSoul } from '../lib/soul-client';
import { seededStore } from '../lib/vessel-seed';
import { useWord } from '../lib/use-word';
import { vesselViews, type VesselView } from '../lib/vessel-views';
import { EmptyState } from './EmptyState';
import { PageShell } from './PageShell';
import { VesselBill } from './VesselBill';
import { VesselTable } from './VesselTable';

const API = process.env.NEXT_PUBLIC_API_URL;

type State =
  | { phase: 'loading' }
  | { phase: 'empty'; reason: 'no-soul' | 'no-actions' | 'no-data' | 'failed'; message?: string }
  | { phase: 'ready'; soul: Soul; vessel: Vessel; views: VesselView[] };

/**
 * The reborn app (Prompt 59): the Vessel runtime running the project's Soul, laid out for a phone.
 * The old main menu is the navigation (at the bottom on a phone, at the side on a desktop); each
 * screen is a form or a list. The records are the old app's own data files, in this page for now
 * (on the phone, offline, with Prompt 60).
 */
export function VesselApp({ projectId }: { projectId: string }) {
  const t = useTranslations('vessel');
  const word = useWord();
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [current, setCurrent] = useState(0);
  // Bumped after a save, so the lists read the records again.
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [p, s] = await Promise.all([getProject(API, projectId), getSoul(API, projectId)]);
      if (!alive) return;
      if (!s.ok)
        return setState({
          phase: 'empty',
          reason: s.reason === 'none' ? 'no-soul' : 'failed',
          ...(s.reason === 'error' ? { message: s.message } : {}),
        });
      if (!s.soul.actions.length) return setState({ phase: 'empty', reason: 'no-actions' });
      const app =
        p.ok && p.project.source === 'graveyard' ? findApp(p.project.sourceApp) : undefined;
      if (!p.ok || !app) return setState({ phase: 'empty', reason: 'no-data' });
      const res = await fetch(app.bundle);
      if (!res.ok) return setState({ phase: 'empty', reason: 'failed', message: `${res.status}` });
      const { store } = await seededStore(new Uint8Array(await res.arrayBuffer()), s.soul);
      const today = (p.project.dosTime ?? app.dosTime).slice(0, 10);
      const vessel = createVessel(s.soul, store, { today: () => today });
      if (alive) setState({ phase: 'ready', soul: s.soul, vessel, views: vesselViews(s.soul) });
    })().catch((e: unknown) => {
      if (alive) setState({ phase: 'empty', reason: 'failed', message: (e as Error).message });
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (state.phase !== 'ready')
    return (
      <PageShell title={t('title')}>
        {state.phase === 'loading' ? (
          <p className="mt-4 text-sm text-bone/70">{t('loading')}</p>
        ) : (
          <EmptyState
            title={t('emptyTitle')}
            body={`${t(`empty.${state.reason}`)}${state.message ? ` ${state.message}` : ''}`}
          />
        )}
      </PageShell>
    );

  const { soul, vessel, views } = state;
  const view = views[current] ?? views[0]!;
  return (
    <main data-testid="vessel-app" className="mx-auto max-w-5xl px-4 pb-28 pt-6 md:px-6 md:pb-12">
      <header className="mb-6">
        <p className="text-sm text-ectoplasm">{t('title')}</p>
        <h1 className="text-2xl font-semibold" lang="en" dir="ltr">
          {soul.app.name}
        </h1>
      </header>
      <div className="md:flex md:gap-6">
        <nav
          aria-label={t('nav')}
          className={cn(
            // A phone: a bar at the bottom, thumbs reach it. A desktop: a sidebar.
            'fixed inset-x-0 bottom-0 z-20 grid border-t border-bone/20 bg-graveyard/95 backdrop-blur',
            'md:static md:flex md:w-56 md:shrink-0 md:flex-col md:gap-1 md:border-0 md:bg-transparent',
          )}
          style={{ gridTemplateColumns: `repeat(${views.length}, minmax(0, 1fr))` }}
        >
          {views.map((v, i) => (
            <button
              key={v.id}
              type="button"
              aria-current={i === current ? 'page' : undefined}
              onClick={() => setCurrent(i)}
              className={cn(
                'min-h-16 px-2 text-sm font-medium transition-colors md:min-h-12 md:rounded-lg md:px-4 md:text-start',
                i === current
                  ? 'text-ectoplasm md:bg-ectoplasm/10'
                  : 'text-bone/75 hover:text-bone md:hover:bg-bone/5',
              )}
            >
              {word(v.title)}
            </button>
          ))}
        </nav>
        <section aria-labelledby="vessel-view-title" className="min-w-0 flex-1">
          <h2 id="vessel-view-title" className="mb-4 text-xl font-semibold">
            {word(view.title)}
          </h2>
          {view.kind === 'action' ? (
            <VesselBill
              key={view.id}
              vessel={vessel}
              actionId={view.actionId}
              onSaved={() => setSaved((n) => n + 1)}
            />
          ) : (
            <VesselTable
              key={`${view.id}-${saved}`}
              vessel={vessel}
              entity={view.entity}
              fields={view.fields}
            />
          )}
        </section>
      </div>
    </main>
  );
}
