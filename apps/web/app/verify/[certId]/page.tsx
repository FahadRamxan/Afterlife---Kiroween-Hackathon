import { getTranslations } from 'next-intl/server';
import { EmptyState } from '../../../components/EmptyState';
import { PageShell } from '../../../components/PageShell';
import { VerifyCertificate } from '../../../components/VerifyCertificate';
import { isProjectId } from '../../../lib/projects';

/** A Rebirth Certificate, checked in the browser (Prompt 72). Certificate ids are UUIDs too. */
export default async function VerifyPage({ params }: { params: Promise<{ certId: string }> }) {
  const { certId } = await params;
  const t = await getTranslations('verify');
  return (
    <PageShell title={t('title')}>
      {isProjectId(certId) ? (
        <VerifyCertificate certId={certId} />
      ) : (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody', { certId })} />
      )}
    </PageShell>
  );
}
