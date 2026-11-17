import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { LanguageToggle } from './LanguageToggle';
import { LogoMark } from './Logo';

export function TopBar() {
  const t = useTranslations('nav');
  const links = [
    { href: '/graveyard', label: t('graveyard') },
    { href: '/playground', label: t('playground') },
    { href: '/design', label: t('design') },
  ];
  return (
    <header className="border-b border-bone/10">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <Link
          href="/"
          aria-label={t('home')}
          className="flex items-center gap-2 font-mono font-semibold text-bone"
        >
          <LogoMark className="h-8 w-7" />
          <span>Afterlife</span>
        </Link>
        <nav aria-label={t('main')} className="flex flex-1 gap-4 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-bone/80 hover:text-bone">
              {l.label}
            </Link>
          ))}
        </nav>
        <LanguageToggle />
      </div>
    </header>
  );
}
