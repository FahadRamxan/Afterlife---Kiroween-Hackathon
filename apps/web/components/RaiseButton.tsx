'use client';
import { Button } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createProject, type Failure } from '../lib/projects';

const API = process.env.NEXT_PUBLIC_API_URL;

/**
 * Raise: creates a project for this Graveyard app (POST /api/projects) and opens /raise/<id>.
 * If the API cannot make one, it says why and still lets the visitor open the app unsaved.
 */
export function RaiseButton({ app, name }: { app: string; name: string }) {
  const t = useTranslations('graveyard');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function raise() {
    setBusy(true);
    setFailure(null);
    const r = await createProject(API, app);
    if (r.ok) return router.push(`/raise/${r.project.id}`);
    setFailure(r);
    setBusy(false);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        type="button"
        onClick={raise}
        disabled={busy}
        aria-label={t('raiseApp', { name })}
        data-testid="raise-button"
      >
        {busy ? t('raising') : t('raise')}
      </Button>
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
