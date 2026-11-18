'use client';

import { cn } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { checkApiHealth, type ApiStatus } from '../lib/api-status';

const POLL_MS = 30_000;
const DOT: Record<ApiStatus['state'] | 'checking', string> = {
  checking: 'bg-bone/50',
  healthy: 'bg-ectoplasm',
  down: 'bg-blood',
  unconfigured: 'bg-candle',
};

/** Footer chip showing whether the API answers /health. Polls every 30 seconds. */
export function ApiStatusChip() {
  const t = useTranslations('footer.api');
  const [status, setStatus] = useState<ApiStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const run = () =>
      checkApiHealth(process.env.NEXT_PUBLIC_API_URL).then((s) => alive && setStatus(s));
    run();
    const id = setInterval(run, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const state = status?.state ?? 'checking';
  return (
    <p
      data-testid="api-status"
      data-state={state}
      role="status"
      className="inline-flex items-center gap-2 rounded-full border border-bone/20 px-3 py-1 font-mono text-xs"
    >
      <span aria-hidden="true" className={cn('size-2 rounded-full', DOT[state])} />
      {t(state)}
      {status?.state === 'healthy' ? <span className="text-bone/60">v{status.version}</span> : null}
      {/* Data in memory is lost when the API restarts: say so, in full-strength body text. */}
      {status?.state === 'healthy' && status.storage !== 'unknown' ? (
        <span
          data-testid="api-storage"
          data-storage={status.storage}
          className={status.storage === 'memory' ? 'text-bone' : 'text-bone/60'}
        >
          {t(`storage.${status.storage}`)}
        </span>
      ) : null}
    </p>
  );
}
