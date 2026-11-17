import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageShell } from '../../../components/PageShell';
import { RaiseTabs } from '../../../components/RaiseTabs';
import { findApp } from '../../../lib/graveyard';
import { parseTab } from '../../../lib/raise-tabs';

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const app = findApp((await params).projectId);
  if (!app) return {};
  const t = await getTranslations('raise');
  return { title: `${t('title', { name: app.name })} · Afterlife` };
}

export default async function RaisePage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const { tab } = await searchParams;
  // Only the Graveyard apps can be raised for now. Uploaded projects come in Prompt 40.
  const app = findApp(projectId);
  if (!app) notFound();
  const t = await getTranslations('raise');
  return (
    <PageShell title={t('title', { name: app.name })}>
      <RaiseTabs initial={parseTab(tab)} />
    </PageShell>
  );
}
