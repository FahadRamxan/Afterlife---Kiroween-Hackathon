import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageShell } from '../../../components/PageShell';
import { ProjectRaise } from '../../../components/ProjectRaise';
import { RaiseTabs } from '../../../components/RaiseTabs';
import { SeanceRecorder } from '../../../components/SeanceRecorder';
import { findApp } from '../../../lib/graveyard';
import { isProjectId } from '../../../lib/projects';
import { parseTab } from '../../../lib/raise-tabs';

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { projectId } = await params;
  const t = await getTranslations('raise');
  if (isProjectId(projectId)) return { title: `${t('project.metaTitle')} · Afterlife` };
  const app = findApp(projectId);
  if (!app) return {};
  return { title: `${t('title', { name: app.name })} · Afterlife` };
}

/**
 * /raise/<project id> is a saved project (Prompt 36), read from the API in the browser.
 * /raise/<graveyard app id> still opens a Graveyard app without saving anything (direct links,
 * and the fallback when the API cannot create a project).
 */
export default async function RaisePage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const { tab } = await searchParams;
  if (isProjectId(projectId))
    return <ProjectRaise id={projectId.toLowerCase()} initial={parseTab(tab)} />;
  const app = findApp(projectId);
  if (!app) notFound();
  const t = await getTranslations('raise');
  return (
    <PageShell title={t('title', { name: app.name })}>
      <RaiseTabs
        initial={parseTab(tab)}
        panels={{
          possession: (
            <SeanceRecorder
              projectId={app.id}
              bundle={app.bundle}
              name={app.name}
              dosTime={app.dosTime}
            />
          ),
        }}
      />
    </PageShell>
  );
}
