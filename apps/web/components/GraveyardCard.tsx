import { Button, CRTFrame, Tombstone } from '@afterlife/ui';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { storyLines, type GraveyardApp } from '../lib/graveyard';

/** One dead app: its first screen from a real DOSBox run, idle under fog, and a Raise button. */
export function GraveyardCard({ app }: { app: GraveyardApp }) {
  const t = useTranslations('graveyard');
  const locale = useLocale();
  return (
    <Tombstone
      data-testid="tombstone"
      className="h-full"
      name={`${app.name} v${app.version}`}
      born={app.born}
      died={app.died}
      actions={
        <Button asChild>
          <Link href={`/raise/${app.id}`} aria-label={t('raiseApp', { name: app.name })}>
            {t('raise')}
          </Link>
        </Button>
      }
    >
      <div className="relative mx-auto w-full max-w-[18rem]">
        <CRTFrame
          label={t('preview', { name: app.name, year: app.born })}
          className="border-2 p-1.5 *:p-1.5"
        >
          <pre aria-hidden="true" className="text-[3.6px] leading-[1.25] sm:text-[4.2px]">
            {app.preview.join('\n')}
          </pre>
        </CRTFrame>
        <div
          aria-hidden="true"
          className="graveyard-fog pointer-events-none absolute inset-0 rounded-2xl"
        />
      </div>
      <p className="mt-3 text-xs text-bone/70">{app.place}</p>
      <div
        data-testid="story"
        lang="en"
        className="mt-2 space-y-1 text-left text-sm"
        dir={locale === 'ur' ? 'ltr' : undefined}
      >
        {storyLines(app.story).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </Tombstone>
  );
}
