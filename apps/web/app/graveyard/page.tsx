import { useTranslations } from 'next-intl';
import { EmptyState } from '../../components/EmptyState';
import { PageShell } from '../../components/PageShell';

export default function GraveyardPage() {
  const t = useTranslations('graveyard');
  return (
    <PageShell title={t('title')}>
      <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
    </PageShell>
  );
}
