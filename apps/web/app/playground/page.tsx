import { useTranslations } from 'next-intl';
import { EmptyState } from '../../components/EmptyState';
import { PageShell } from '../../components/PageShell';
import { RuleTryout } from '../../components/RuleTryout';

export default function PlaygroundPage() {
  const t = useTranslations('playground');
  return (
    <PageShell title={t('title')}>
      <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      <RuleTryout />
    </PageShell>
  );
}
