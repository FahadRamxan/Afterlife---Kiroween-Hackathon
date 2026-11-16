'use client';

import { cn } from '@afterlife/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { setLocale } from '../app/actions';
import { LOCALES } from '../lib/i18n';

export function LanguageToggle() {
  const t = useTranslations('language');
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label={t('label')}
      className="inline-flex rounded-md border border-bone/25 p-0.5"
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={current === l}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setLocale(l);
              router.refresh();
            })
          }
          className={cn(
            'rounded px-2.5 py-1 text-sm transition-colors',
            current === l ? 'bg-ectoplasm text-graveyard' : 'text-bone hover:bg-bone/10',
            l === 'ur' ? 'font-urdu' : 'font-sans',
          )}
        >
          {t(l)}
        </button>
      ))}
    </div>
  );
}
