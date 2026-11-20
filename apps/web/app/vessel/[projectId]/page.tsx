import { getTranslations } from 'next-intl/server';
import { EmptyState } from '../../../components/EmptyState';
import { PageShell } from '../../../components/PageShell';
import { VesselApp } from '../../../components/VesselApp';
import { isProjectId } from '../../../lib/projects';

/** The reborn app of a project (Prompt 59): the Vessel running its Soul. */
export default async function VesselPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (isProjectId(projectId)) return <VesselApp projectId={projectId} />;
  const t = await getTranslations('vessel');
  return (
    <PageShell title={t('title')}>
      <EmptyState title={t('emptyTitle')} body={t('emptyBody', { projectId })} />
    </PageShell>
  );
}
