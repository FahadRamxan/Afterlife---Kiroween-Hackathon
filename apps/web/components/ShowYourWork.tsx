'use client';
import { Button, ProgressCandle } from '@afterlife/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import type { LiveEvent } from '../lib/live';
import { getLlmCall, getLlmCalls, type LlmCallDetail, type LlmCallList } from '../lib/llm-calls';

const API = process.env.NEXT_PUBLIC_API_URL;

/** One call's request and response, fetched when its row is opened. */
function CallBody({ projectId, callId }: { projectId: string; callId: string }) {
  const t = useTranslations('raise.work');
  const [detail, setDetail] = useState<LlmCallDetail | string | null>(null);
  useEffect(() => {
    let alive = true;
    getLlmCall(API, projectId, callId).then((r) => {
      if (alive) setDetail(r.ok ? r.call : 'message' in r ? r.message : t('failed'));
    });
    return () => {
      alive = false;
    };
  }, [projectId, callId, t]);
  if (detail === null) return <p className="mt-2 text-bone/70">{t('opening')}</p>;
  if (typeof detail === 'string') return <p role="alert">{detail}</p>;
  return (
    <div className="mt-2 grid gap-2 md:grid-cols-2" lang="en" dir="ltr">
      <div>
        <h4 className="text-xs font-semibold">{t('request')}</h4>
        <pre
          data-testid="llm-call-request"
          className="mt-1 max-h-72 overflow-auto rounded-md border border-bone/15 p-2 font-mono text-xs"
        >
          {JSON.stringify(detail.request, null, 2)}
        </pre>
      </div>
      <div>
        <h4 className="text-xs font-semibold">{t('response')}</h4>
        {detail.response === null ? (
          <p className="mt-1 text-xs text-bone/70">{t('noResponse')}</p>
        ) : (
          <pre
            data-testid="llm-call-response"
            className="mt-1 max-h-72 overflow-auto rounded-md border border-bone/15 p-2 font-mono text-xs"
          >
            {JSON.stringify(detail.response, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

/**
 * "Show your work" (Prompt 47, crew.md): every model call the Crew made for this project, with
 * its token cost against the project's budget. Reloads when a pipeline step starts or ends.
 */
export function ShowYourWork({ projectId, events }: { projectId: string; events: LiveEvent[] }) {
  const t = useTranslations('raise.work');
  const locale = useLocale();
  const [list, setList] = useState<LlmCallList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Reloaded when a step ends (its calls are all logged by then), not on every event: a raise
  // sends dozens, and the API rate-limits each address.
  const steps = events.filter(
    (e) =>
      e.type === 'step' &&
      ['done', 'failed', 'skipped'].includes((e.payload as { state?: string })?.state ?? ''),
  ).length;
  const load = useCallback(() => {
    let alive = true;
    getLlmCalls(API, projectId).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setList(r.list);
        setError(null);
      } else setError('message' in r ? r.message : t(`unavailable.${r.reason}`));
    });
    return () => {
      alive = false;
    };
  }, [projectId, t]);
  useEffect(() => {
    // The replayed events arrive together: one load for the lot.
    let cancel: (() => void) | undefined;
    const timer = setTimeout(() => (cancel = load()), steps ? 500 : 0);
    return () => {
      clearTimeout(timer);
      cancel?.();
    };
  }, [load, steps]);
  const n = (v: number) => v.toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-US');
  return (
    <section aria-labelledby="work-heading" data-testid="show-your-work" className="mt-6">
      <div className="flex items-center gap-3">
        <h2 id="work-heading" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <Button type="button" variant="ghost" onClick={() => load()}>
          {t('refresh')}
        </Button>
      </div>
      <p className="mt-1 max-w-prose text-sm text-bone/70">{t('intro')}</p>
      {error ? (
        <p role="alert" className="mt-2 text-sm">
          {t('failed')}{' '}
          <span lang="en" dir="ltr">
            {error}
          </span>
        </p>
      ) : null}
      {!list && !error ? <p className="mt-2 text-sm text-bone/70">{t('loading')}</p> : null}
      {list ? (
        <>
          <ProgressCandle
            value={list.budget.used}
            max={list.budget.tokens}
            label={t('budgetLabel')}
            className="mt-3 max-w-sm"
          />
          <p data-testid="llm-budget" className="mt-1 text-sm">
            {t('budget', { used: n(list.budget.used), tokens: n(list.budget.tokens) })}
          </p>
          {list.calls.length === 0 ? (
            <p data-testid="llm-calls-empty" className="mt-2 text-sm text-bone/70">
              {t('empty')}
            </p>
          ) : (
            <>
              {list.total > list.calls.length ? (
                <p className="mt-2 text-xs text-bone/70">
                  {t('shown', { shown: n(list.calls.length), total: n(list.total) })}
                </p>
              ) : null}
              <ol data-testid="llm-calls" className="mt-2 space-y-1 text-sm">
                {list.calls.map((c) => (
                  <li key={c.id} data-testid="llm-call" data-status={c.status}>
                    <details
                      onToggle={(e) => {
                        const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                        setOpen((s) => {
                          const next = new Set(s);
                          if (isOpen) next.add(c.id);
                          else next.delete(c.id);
                          return next;
                        });
                      }}
                    >
                      <summary className="cursor-pointer">
                        <time dateTime={c.at} lang="en" dir="ltr" className="font-mono text-candle">
                          {c.at.slice(11, 19)}
                        </time>{' '}
                        <span lang="en" dir="ltr" className="font-mono text-ectoplasm">
                          {c.agent}
                        </span>{' '}
                        <span lang="en" dir="ltr">
                          {c.purpose}
                        </span>
                        {' · '}
                        <span data-testid="llm-call-status">{t(`status.${c.status}`)}</span>
                        {c.attempt > 1 ? (
                          <span className="text-bone/70"> · {t('attempt', { n: c.attempt })}</span>
                        ) : null}
                        <span className="text-bone/70">
                          {' · '}
                          {t('tokens', { n: n(c.inputTokens + c.outputTokens) })}
                          {' · '}
                          <span lang="en" dir="ltr" className="font-mono">
                            {c.provider}/{c.model}
                          </span>
                        </span>
                        {c.error ? (
                          <span lang="en" dir="ltr" className="block pl-4 text-bone/80">
                            {c.error}
                          </span>
                        ) : null}
                      </summary>
                      {open.has(c.id) ? <CallBody projectId={projectId} callId={c.id} /> : null}
                    </details>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
