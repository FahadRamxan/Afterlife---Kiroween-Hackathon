'use client';
import type { Soul } from '@afterlife/soul';
import { Button, cn } from '@afterlife/ui';
import type { Vessel } from '@afterlife/vessel';
import { openPhone } from '@afterlife/vessel/indexeddb';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWord } from '../lib/use-word';
import { PhoneError, reviewed, startPhone, syncPhone, type Synced } from '../lib/vessel-phone';
import { vesselViews, type VesselView } from '../lib/vessel-views';
import { EmptyState } from './EmptyState';
import { PageShell } from './PageShell';
import { VesselBill } from './VesselBill';
import { VesselTable } from './VesselTable';

const API = process.env.NEXT_PUBLIC_API_URL;
/** The cache the service worker falls back to offline (app/sw.ts). */
const SHELL_CACHE = 'vessel-shell';

type State =
  | { phase: 'loading' }
  | { phase: 'empty'; reason: string; message?: string }
  | { phase: 'ready'; soul: Soul; vessel: Vessel; views: VesselView[] };

/** navigator.onLine, kept up to date. */
function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    on();
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);
  return online;
}

/**
 * The service worker, for /vessel/ only, and the app's shell in its cache: this page and every
 * script and font it loaded. Opened again offline, the page comes from there.
 */
async function keepShell(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('caches' in window)) return false;
  await navigator.serviceWorker.register('/sw.js', { scope: '/vessel/' });
  const urls = [
    location.href,
    ...performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter(
        (u) => u.startsWith(location.origin) && !u.includes('/api/') && !u.includes('webpack-hmr'),
      ),
  ];
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all([...new Set(urls)].map((u) => cache.add(u).catch(() => undefined)));
  return true;
}

/**
 * The reborn app (Prompts 59 and 60): the Vessel runtime running the project's Soul, laid out for
 * a phone, and offline-first. The shop's records, the Soul and the bills not yet sent are in
 * IndexedDB on the phone; online, bills go to the server as soon as they are saved, and the
 * server's records (other phones' sales) come back.
 */
export function VesselApp({ projectId }: { projectId: string }) {
  const t = useTranslations('vessel');
  const word = useWord();
  const online = useOnline();
  const phone = useRef<ReturnType<typeof openPhone> | null>(null);
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [current, setCurrent] = useState(0);
  // Bumped when the records change under the screens (a save, the server's records).
  const [dataVersion, setDataVersion] = useState(0);
  const [waiting, setWaiting] = useState(0);
  const [sync, setSync] = useState<Synced | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [shell, setShell] = useState(false);

  const countWaiting = useCallback(async () => {
    if (phone.current) setWaiting((await phone.current.outbox.pending()).length);
  }, []);

  const doSync = useCallback(async () => {
    if (!phone.current || !API || state.phase !== 'ready') return;
    setSyncing(true);
    try {
      const r = await syncPhone(phone.current, {
        api: API,
        projectId,
        files: state.soul.entities.map((e) => e.file),
      });
      setSync(r);
      if (r.pulled) setDataVersion((n) => n + 1);
    } finally {
      setSyncing(false);
      await countWaiting();
    }
  }, [projectId, state, countWaiting]);

  useEffect(() => {
    let alive = true;
    const p = openPhone(`afterlife-vessel-${projectId}`);
    phone.current = p;
    startPhone(p, { api: API, projectId })
      .then(async ({ vessel, soul }) => {
        if (!alive) return;
        setState({ phase: 'ready', soul, vessel, views: vesselViews(soul) });
        setWaiting((await p.outbox.pending()).length);
        keepShell()
          .then((ok) => alive && setShell(ok))
          .catch(() => undefined);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const reason = e instanceof PhoneError ? e.reason : 'failed';
        setState({ phase: 'empty', reason, message: (e as Error).message });
      });
    return () => {
      alive = false;
      void p.close();
    };
  }, [projectId]);

  // Online again (or for the first time): send what is waiting, take the server's records.
  useEffect(() => {
    if (online && state.phase === 'ready') void doSync();
  }, [online, state.phase, doSync]);

  if (state.phase !== 'ready')
    return (
      <PageShell title={t('title')}>
        {state.phase === 'loading' ? (
          <p className="mt-4 text-sm text-bone/70">{t('loading')}</p>
        ) : (
          <EmptyState
            title={t('emptyTitle')}
            body={
              state.reason === 'failed'
                ? `${t('empty.failed')} ${state.message ?? ''}`
                : t(`empty.${state.reason}`)
            }
          />
        )}
      </PageShell>
    );

  const { soul, vessel, views } = state;
  const view = views[current] ?? views[0]!;
  const renumbered = sync?.results.filter((r) => r.renumbered) ?? [];
  return (
    <main
      data-testid="vessel-app"
      data-shell={shell ? 'kept' : 'no'}
      data-waiting={waiting}
      className="mx-auto max-w-5xl px-4 pb-28 pt-6 md:px-6 md:pb-12"
    >
      <header className="mb-4">
        <p className="text-sm text-ectoplasm">{t('title')}</p>
        <h1 className="text-2xl font-semibold" lang="en" dir="ltr">
          {soul.app.name}
        </h1>
      </header>

      {/* Where the bills are: on this phone only, being sent, or on the server. */}
      <div className="mb-4 space-y-2">
        {!online ? (
          <p
            role="status"
            data-testid="vessel-offline"
            className="rounded-lg border border-candle/50 bg-candle/10 p-3 text-sm"
          >
            <span className="font-semibold">{t('sync.offline')}</span>{' '}
            {waiting ? t('sync.waiting', { count: waiting }) : null}
          </p>
        ) : waiting || syncing ? (
          <p role="status" data-testid="vessel-sending" className="text-sm text-bone/75">
            {t('sync.sending', { count: waiting })}
          </p>
        ) : sync?.results.length ? (
          <p role="status" data-testid="vessel-synced" className="text-sm text-bone/75">
            {t('sync.done', { count: sync.results.filter((r) => r.ok).length })}
            {renumbered.map((r) => (
              <span key={r.id} className="block" lang="en" dir="ltr">
                {t('sync.renumbered', { phone: r.renumbered!.phone, server: r.renumbered!.server })}
              </span>
            ))}
          </p>
        ) : null}
        {sync?.review.length ? (
          <section
            data-testid="vessel-review"
            aria-labelledby="vessel-review-title"
            className="rounded-lg border border-blood/60 p-3"
          >
            <h2 id="vessel-review-title" className="font-semibold">
              {t('review.title', {
                count: sync.review.reduce((n, r) => n + r.conflicts.length, 0),
              })}
            </h2>
            <p className="text-sm text-bone/75">{t('review.body')}</p>
            <ul className="mt-2 space-y-2">
              {sync.review.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <span>
                    {r.conflicts.map((c, i) => (
                      <span key={i} className="block" data-testid="vessel-conflict">
                        {t('review.conflict', {
                          record: c.key,
                          field: word(c.field),
                          phoneBefore: String(c.phone.before ?? ''),
                          phoneAfter: String(c.phone.after ?? ''),
                          serverBefore: String(c.server?.before ?? ''),
                          serverAfter: String(c.server?.after ?? ''),
                        })}
                        {r.record ? ` ${t('review.bill', { record: r.record })}` : ''}
                      </span>
                    ))}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      if (API && (await reviewed(API, projectId, r.id)))
                        setSync({ ...sync, review: sync.review.filter((x) => x.id !== r.id) });
                    }}
                  >
                    {t('review.done')}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

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
              dataVersion={dataVersion}
              onSaved={async () => {
                setDataVersion((n) => n + 1);
                await countWaiting();
                if (navigator.onLine) await doSync();
              }}
            />
          ) : (
            <VesselTable
              key={`${view.id}-${dataVersion}`}
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
