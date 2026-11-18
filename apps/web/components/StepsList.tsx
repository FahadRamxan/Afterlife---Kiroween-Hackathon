'use client';
import { Button, ProgressCandle } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { LiveEvent } from '../lib/live';
import { applyStepEvents, getSteps, rerunStep, type StepState } from '../lib/steps';

const API = process.env.NEXT_PUBLIC_API_URL;
const SETTLED = new Set(['done', 'skipped', 'failed']);

/** The six pipeline steps: where each one is, why it was skipped, and "Run again" (alone). */
export function StepsList({ projectId, events }: { projectId: string; events: LiveEvent[] }) {
  const t = useTranslations('raise.steps');
  const [base, setBase] = useState<StepState[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getSteps(API, projectId).then((r) => {
      if (!alive) return;
      if (r.ok) setBase(r.steps);
      else setError('message' in r ? r.message : t(`unavailable.${r.reason}`));
    });
    return () => {
      alive = false;
    };
  }, [projectId, t]);

  // The API's answer, moved along by every live step event since.
  const steps = useMemo(() => (base ? applyStepEvents(base, events) : null), [base, events]);

  async function again(step: string) {
    setBusy(step);
    setError(null);
    const r = await rerunStep(API, projectId, step);
    if (!r.ok) setError('message' in r ? r.message : t(`unavailable.${r.reason}`));
    setBusy(null);
  }

  if (!steps)
    return error ? (
      <p role="alert" className="mt-4 text-sm">
        {error}
      </p>
    ) : null;
  const settled = steps.filter((s) => SETTLED.has(s.status)).length;
  return (
    <section aria-labelledby="steps-heading" data-testid="steps" className="mt-6">
      <h2 id="steps-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <ProgressCandle
        value={settled}
        max={steps.length}
        label={t('progress', { settled, total: steps.length })}
        className="mt-2 max-w-sm"
      />
      <ol className="mt-3 space-y-2">
        {steps.map((s) => (
          <li
            key={s.step}
            data-testid={`step-${s.step}`}
            data-status={s.status}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
          >
            <span className="w-28 font-mono" lang="en" dir="ltr">
              {s.step}
            </span>
            <span data-testid="step-status">{t(`status.${s.status}`)}</span>
            {s.attempts > 1 ? (
              <span className="text-bone/70">{t('attempts', { n: s.attempts })}</span>
            ) : null}
            {s.reason ? (
              <span className="text-bone/70" lang="en" dir="ltr">
                {s.reason}
              </span>
            ) : null}
            {s.error ? (
              <span className="text-bone" lang="en" dir="ltr">
                {s.error}
              </span>
            ) : null}
            {SETTLED.has(s.status) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                onClick={() => again(s.step)}
                aria-label={t('again', { step: s.step })}
              >
                {t('againShort')}
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
      {error ? (
        <p role="alert" className="mt-2 text-sm">
          {error}
        </p>
      ) : null}
    </section>
  );
}
