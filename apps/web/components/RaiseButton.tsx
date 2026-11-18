'use client';
import { Button } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createProject, type Failure, type Project } from '../lib/projects';

const API = process.env.NEXT_PUBLIC_API_URL;

/**
 * Raise: creates a project for this Graveyard app (POST /api/projects) and opens /raise/<id>.
 * "Recorded run" does the same in demo mode: the steps replay a real run, fast, and the page
 * says so. If the API cannot make a project, it says why and still lets the visitor open the app.
 */
export function RaiseButton({ app, name }: { app: string; name: string }) {
  const t = useTranslations('graveyard');
  const router = useRouter();
  const [busy, setBusy] = useState<Project['mode'] | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function raise(mode: Project['mode']) {
    setBusy(mode);
    setFailure(null);
    const r = await createProject(API, app, fetch, mode);
    if (r.ok) return router.push(`/raise/${r.project.id}`);
    setFailure(r);
    setBusy(null);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          onClick={() => raise('live')}
          disabled={busy !== null}
          aria-label={t('raiseApp', { name })}
          data-testid="raise-button"
        >
          {busy === 'live' ? t('raising') : t('raise')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => raise('recorded')}
          disabled={busy !== null}
          aria-label={t('recordedApp', { name })}
          title={t('recordedHint')}
        >
          {busy === 'recorded' ? t('raising') : t('recorded')}
        </Button>
      </div>
      {failure ? (
        <div role="alert" className="text-center text-xs text-bone">
          <p>
            {t(`raiseFailed.${failure.reason}`)}
            {'message' in failure ? ` ${failure.message}` : ''}
          </p>
          <Link href={`/raise/${app}`} className="underline underline-offset-2">
            {t('openUnsaved')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
