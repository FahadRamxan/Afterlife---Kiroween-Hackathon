'use client';
import { useTranslations } from 'next-intl';
import { wordKey } from './vessel-views';

/** A word of the old app ("NEW BILL", "QTY") in the owner's language, or tidied up when unknown. */
export function useWord() {
  const t = useTranslations('vessel.words');
  return (s: string) => {
    const k = wordKey(s);
    if (k && t.has(k)) return t(k);
    const tidy = s.replace(/_/g, ' ').trim().toLowerCase();
    return tidy.charAt(0).toUpperCase() + tidy.slice(1);
  };
}
