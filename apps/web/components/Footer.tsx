import { useTranslations } from 'next-intl';
import { ApiStatusChip } from './ApiStatusChip';

export function Footer() {
  const t = useTranslations('footer');
  return (
    <footer className="border-t border-bone/10">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm text-bone/70">
        <p>{t('credit')}</p>
        <ApiStatusChip />
      </div>
    </footer>
  );
}
