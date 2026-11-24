'use client';
import { Button, cn, ProgressCandle } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { LiveEvent } from '../lib/live';
import {
  candleOf,
  changesText,
  getTwin,
  getTwinEvents,
  newTwinToken,
  simulateDay,
  switchOver,
  type Candle,
  type TwinOverview,
  type TwinPair,
} from '../lib/twin';
const API = process.env.NEXT_PUBLIC_API_URL;
const FEED = 20;
/** Each candle state has one colour: ectoplasm all matched, blood a mismatch, candle still open. */
const CANDLE: Record<Candle, string> = {
  matched: 'bg-ectoplasm',
  mismatched: 'bg-blood',
  unknown: 'bg-candle',
  pending: 'bg-candle/50',
};
/**
 * The Ghost Twin tab (Prompt 79): the reborn app in shadow mode. A candle for each shop day
 * (green when every transaction matched, red with a mismatch), a live feed of twin pairs (what
 * the old app wrote, what the reborn app made of it), the readiness meter, and the switch-over,
 * which asks first. "Simulate a day in the shop" adds a recorded day of the real old app (demo mode).
 */
export function GhostTwinTab({ projectId, events }: { projectId: string; events: LiveEvent[] }) {
  const t = useTranslations('raise.twin');
  // Read again whenever a twin event arrives or is replayed, or the twin step starts or ends.
  const beats = useMemo(
    () =>
      events.filter(
        (e) =>
          e.type === 'twin' ||
          (e.type === 'step' && (e.payload as { step?: string })?.step === 'twin-replay'),
      ).length,
    [events],
  );
  const [twin, setTwin] = useState<TwinOverview | null>(null);
  const [feed, setFeed] = useState<TwinPair[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      const o = await getTwin(API, projectId);
      if (!alive) return;
      if (!o.ok) return setError(o.message);
      setTwin(o.twin);
      // The newest pairs: the list gives the changes after a number, oldest first, 500 at most,
      // so from the start it would stop at the 500th change of a real shop and never move on.
      const after = Math.max(0, (o.twin.lastSeq ?? 0) - FEED);
      const list = await getTwinEvents(API, projectId, after);
      if (alive && list.ok) setFeed(list.events.slice(-FEED).reverse());
    })();
    return () => {
      alive = false;
    };
  }, [projectId, beats, version]);
  async function simulate() {
    setBusy(true);
    setError(null);
    const r = await simulateDay(API, projectId);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setNotice(t('simulated', { day: r.day, n: r.events }));
    setVersion((v) => v + 1);
  }
  async function doSwitch() {
    setBusy(true);
    setError(null);
    const r = await switchOver(API, projectId);
    setBusy(false);
    setConfirming(false);
    if (!r.ok) return setError(r.message);
    setNotice(t('switchedNotice', { n: r.migrated.events }));
    setVersion((v) => v + 1);
  }
  async function connect() {
    const r = await newTwinToken(API, projectId);
    if (!r.ok) return setError(r.message);
    setToken(r.token);
    setVersion((v) => v + 1);
  }
  if (!twin) return error ? <p role="alert">{error}</p> : null;
  const r = twin.readiness;
  const switched = twin.primaryApp === 'vessel';
  return (
    <section aria-labelledby="twin-title" data-testid="ghost-twin" className="mt-6 space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="twin-title" className="text-lg font-semibold">
          {t('title')}
        </h3>
        <p
          data-testid="twin-primary"
          data-primary={twin.primaryApp}
          className={cn('font-mono text-sm', switched ? 'text-ectoplasm' : 'text-bone/80')}
        >
          {switched ? t('primaryVessel', { at: twin.switchedAt!.slice(0, 10) }) : t('primaryOld')}
        </p>
      </div>
      <p className="text-sm text-bone/80">{t('intro')}</p>
      {notice ? (
        <p role="status" data-testid="twin-notice" className="text-sm text-ectoplasm">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" data-testid="twin-error" className="text-sm text-blood">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-8">
        <div data-testid="twin-readiness" data-score={r.score} data-ready={r.ready}>
          <ProgressCandle value={r.score} max={100} label={t('readiness')} />
        </div>
        <div className="min-w-60 flex-1 space-y-2 text-sm">
          <p className="font-semibold">{t('readiness')}</p>
          <ul className="space-y-1 font-mono">
            <li data-testid="twin-days">{t('days', { n: r.days, of: r.rule.days })}</li>
            <li data-testid="twin-matched">{t('matched', { n: r.matched, of: r.rule.matched })}</li>
            <li data-testid="twin-mismatched" className={r.mismatched ? 'text-blood' : ''}>
              {t('mismatched', { n: r.mismatched })}
            </li>
            <li data-testid="twin-unknown">{t('unknown', { n: r.unknown })}</li>
          </ul>
          {r.ready ? (
            <p data-testid="twin-ready" className="text-ectoplasm">
              {t('ready')}
            </p>
          ) : (
            <ul data-testid="twin-reasons" className="list-disc ps-5 text-bone/80">
              {r.reasons.map((x) => (
                <li key={x} lang="en" dir="ltr">
                  {x}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-3 pt-2">
            {twin.simulate.available ? (
              <Button
                variant="secondary"
                disabled={busy || !twin.simulate.nextDay}
                onClick={simulate}
              >
                {twin.simulate.nextDay
                  ? t('simulate', { day: twin.simulate.nextDay })
                  : t('weekOver')}
              </Button>
            ) : null}
            {switched ? null : (
              <Button
                variant="primary"
                disabled={busy || !r.ready}
                onClick={() => setConfirming(true)}
              >
                {t('switch')}
              </Button>
            )}
          </div>
          {confirming ? (
            <div
              role="alertdialog"
              aria-labelledby="twin-confirm-title"
              data-testid="twin-confirm"
              className="mt-3 rounded-lg border border-candle/60 p-3"
            >
              <p id="twin-confirm-title" className="font-semibold">
                {t('confirmTitle')}
              </p>
              <p className="mt-1 text-bone/80">{t('confirmBody')}</p>
              <div className="mt-3 flex gap-3">
                <Button variant="primary" disabled={busy} onClick={doSwitch}>
                  {t('confirmYes')}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
                  {t('confirmNo')}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold">{t('calendar')}</h4>
        {twin.days.length ? (
          <ol data-testid="twin-calendar" className="flex flex-wrap gap-3">
            {twin.days.map((d) => {
              const c = candleOf(d);
              return (
                <li
                  key={d.date}
                  data-testid="twin-day"
                  data-date={d.date}
                  data-candle={c}
                  className="flex w-24 flex-col items-center gap-1 rounded-lg border border-bone/15 p-2"
                >
                  <span aria-hidden="true" className={cn('h-10 w-3 rounded-t-sm', CANDLE[c])} />
                  <time dateTime={d.date} className="font-mono text-xs text-candle">
                    {d.date}
                  </time>
                  <span className="text-xs">{t(`candle.${c}`)}</span>
                  <span className="font-mono text-xs text-bone/70">
                    {d.matched}/{d.total}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-bone/70">{t('noDays')}</p>
        )}
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold">{t('feed')}</h4>
        {feed.length ? (
          <ol data-testid="twin-feed" className="space-y-1 text-sm">
            {feed.map((p) => {
              const outcome = p.newResult?.outcome ?? 'pending';
              return (
                <li
                  key={p.seq}
                  data-testid="twin-pair"
                  data-outcome={outcome}
                  className="grid grid-cols-[auto_1fr_1fr] gap-3 rounded border border-bone/10 px-2 py-1"
                >
                  <time dateTime={p.occurredAt} className="font-mono text-candle">
                    {p.occurredAt.slice(0, 16).replace('T', ' ')}
                  </time>
                  <span lang="en" dir="ltr" className="font-mono text-phosphor">
                    {t('old')} {changesText(p.changes)}
                  </span>
                  <span
                    className={cn(
                      outcome === 'matched'
                        ? 'text-ectoplasm'
                        : outcome === 'mismatched'
                          ? 'text-blood'
                          : 'text-candle',
                    )}
                  >
                    {t('new')} {t(`outcome.${outcome}`)}
                    {p.newResult?.actionId ? (
                      <span lang="en" dir="ltr" className="font-mono">
                        {' '}
                        {p.newResult.actionId}
                      </span>
                    ) : null}
                    {p.newResult?.reason ? (
                      <span lang="en" dir="ltr" className="block text-xs text-bone/70">
                        {p.newResult.reason}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-bone/70">{t('noFeed')}</p>
        )}
      </div>
      {switched ? null : (
        <details data-testid="twin-connect" className="text-sm">
          <summary className="cursor-pointer text-ectoplasm">{t('connect')}</summary>
          <p className="mt-2 text-bone/80">{t('connectBody')}</p>
          {token ? (
            <pre
              lang="en"
              dir="ltr"
              data-testid="twin-token"
              className="mt-2 overflow-x-auto rounded bg-black p-2 font-mono text-xs text-bone"
            >
              {`set AFTERLIFE_TWIN_TOKEN=${token}\npnpm twin --api ${API ?? '<api>'} --project ${projectId} --dir "C:\\DOSAPPS\\SHIFA"`}
            </pre>
          ) : (
            <Button variant="secondary" className="mt-2" onClick={connect}>
              {twin.hasToken ? t('newToken') : t('makeToken')}
            </Button>
          )}
        </details>
      )}
    </section>
  );
}
