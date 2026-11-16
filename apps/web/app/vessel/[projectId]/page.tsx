import { getTranslations } from 'next-intl/server';
import { EmptyState } from '../../../components/EmptyState';
import { PageShell } from '../../../components/PageShell';

export default async function VesselPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const t = await getTranslations('vessel');
  return (
    <PageShell title={t('title')}>
      <EmptyState title={t('emptyTitle')} body={t('emptyBody', { projectId })} />
    </PageShell>
  );
}
