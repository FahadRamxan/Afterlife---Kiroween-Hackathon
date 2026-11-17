import { Button } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function Home() {
  const t = useTranslations('home');
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="font-mono text-4xl font-semibold text-phosphor">{t('title')}</h1>
      <p className="mt-4 text-lg">{t('tagline')}</p>
      <p className="mt-1 text-bone/75">{t('subline')}</p>
      <Button asChild className="mt-8">
        <Link href="/graveyard">{t('cta')}</Link>
      </Button>
    </main>
  );
}
