import { getTranslations } from 'next-intl/server';
import { PageShell } from '../../../components/PageShell';
import { RaiseTabs } from '../../../components/RaiseTabs';
import { parseTab } from '../../../lib/raise-tabs';

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

export default async function RaisePage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const { tab } = await searchParams;
  const t = await getTranslations('raise');
  return (
    <PageShell title={t('title', { projectId })}>
      <RaiseTabs initial={parseTab(tab)} />
    </PageShell>
  );
}
