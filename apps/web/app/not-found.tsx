import { Button } from '@afterlife/ui';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PageShell } from '../components/PageShell';

export default async function NotFound() {
  const t = await getTranslations('notFound');
  return (
    <PageShell title={t('title')}>
      <p className="mt-4 text-bone/75">{t('body')}</p>
      <Button asChild className="mt-6">
        <Link href="/graveyard">{t('back')}</Link>
      </Button>
    </PageShell>
  );
}
