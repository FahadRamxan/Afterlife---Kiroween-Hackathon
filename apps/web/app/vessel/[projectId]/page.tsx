import { colors } from '@afterlife/ui';
import type { Metadata, Viewport } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '../../../components/EmptyState';
import { PageShell } from '../../../components/PageShell';
import { VesselApp } from '../../../components/VesselApp';
import { isProjectId } from '../../../lib/projects';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  return isProjectId(projectId)
    ? {
        manifest: `/vessel/${projectId}/manifest.webmanifest`,
        appleWebApp: { capable: true, title: 'Vessel' },
      }
    : {};
}

export const viewport: Viewport = { themeColor: colors.graveyard };

/** The reborn app of a project (Prompts 59 and 60): the Vessel running its Soul, offline-first. */
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
