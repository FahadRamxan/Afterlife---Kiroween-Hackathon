'use client';
import { Button } from '@afterlife/ui';
import type { Soul } from '@afterlife/soul';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { LiveEvent } from '../lib/live';
import { requestTranslation, translationState, untranslated } from '../lib/urdu';

const API = process.env.NEXT_PUBLIC_API_URL;

/**
 * How many rules have Urdu, and "Translate rules into Urdu" (Prompt 46): the worker translates
 * with the model and stores a new Soul version, which the Soul tab then loads.
 */
export function UrduRules({
  projectId,
  soul,
  events,
}: {
  projectId: string;
  soul: Soul;
  events: LiveEvent[];
}) {
  const t = useTranslations('raise.soul.urdu');
  const raise = useTranslations('raise.work');
  // The newest event seq when the owner asked: from then on only the new job counts.
  const [since, setSince] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const missing = untranslated(soul);
  const job = translationState(since === null ? events : events.filter((e) => e.seq > since));
  async function translate() {
    setError(null);
    const r = await requestTranslation(API, projectId);
    if (r.ok) setSince(events.at(-1)?.seq ?? 0);
    else setError('message' in r ? r.message : raise(`unavailable.${r.reason}`));
  }
  // A job that is running (or retrying) shows that; a request sent but not started yet is queued.
  const status =
    job.state === 'running'
      ? t('running')
      : job.state === 'retrying'
        ? t('retrying', { message: job.message })
        : since !== null && job.state === 'idle'
          ? t('queued')
          : null;
  const busy = status !== null;
  return (
    <div data-testid="urdu-rules" className="mt-2 space-y-2 text-sm">
      <p data-testid="urdu-missing">{missing ? t('missing', { count: missing }) : t('all')}</p>
      {missing ? (
        <>
          <p className="max-w-prose text-bone/70">{t('how')}</p>
          <Button type="button" size="sm" onClick={translate} disabled={busy}>
            {t('translate')}
          </Button>
        </>
      ) : null}
      {status ? (
        <p role="status" data-testid="urdu-status">
          {status}
        </p>
      ) : null}
      {job.state === 'failed' && missing ? (
        <p role="alert" data-testid="urdu-failed">
          {t('failed')}{' '}
          <span lang="en" dir="ltr">
            {job.message}
          </span>
        </p>
      ) : null}
      {job.state === 'done' && !missing ? (
        <p role="status" data-testid="urdu-done">
          {t('done')}
        </p>
      ) : null}
      {error ? (
        <p role="alert" data-testid="urdu-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
