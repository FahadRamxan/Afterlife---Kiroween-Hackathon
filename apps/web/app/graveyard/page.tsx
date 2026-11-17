import { useTranslations } from 'next-intl';
import { GraveyardCard } from '../../components/GraveyardCard';
import { PageShell } from '../../components/PageShell';
import { UploadCard } from '../../components/UploadCard';
import { loadCatalog } from '../../lib/graveyard';

export const metadata = { title: 'The Graveyard · Afterlife' };

export default function GraveyardPage() {
  const t = useTranslations('graveyard');
  const catalog = loadCatalog();
  return (
    <PageShell title={t('title')}>
      <p className="mt-2 text-bone/80">{t('subtitle')}</p>
      <ul className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {catalog.apps.map((app) => (
          <li key={app.id}>
            <GraveyardCard app={app} />
          </li>
        ))}
        {/* The card takes the whole row while it previews tables, so they have room. */}
        <li className="has-[[data-upload-preview]]:col-span-full">
          <UploadCard />
        </li>
      </ul>
      <p lang="en" dir="ltr" className="mt-8 text-xs text-bone/70">
        {catalog.disclosure}
      </p>
    </PageShell>
  );
}
