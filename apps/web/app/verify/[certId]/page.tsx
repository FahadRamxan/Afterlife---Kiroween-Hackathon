import { getTranslations } from 'next-intl/server';
import { EmptyState } from '../../../components/EmptyState';
import { PageShell } from '../../../components/PageShell';

export default async function VerifyPage({ params }: { params: Promise<{ certId: string }> }) {
  const { certId } = await params;
  const t = await getTranslations('verify');
  return (
    <PageShell title={t('title')}>
      <EmptyState title={t('emptyTitle')} body={t('emptyBody', { certId })} />
    </PageShell>
  );
}
