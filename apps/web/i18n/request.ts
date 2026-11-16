import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_COOKIE, resolveLocale } from '../lib/i18n';

// Locale comes from a cookie (set by the language toggle), not from the URL.
export default getRequestConfig(async () => {
  const locale = resolveLocale(
    (await cookies()).get(LOCALE_COOKIE)?.value,
    (await headers()).get('accept-language') ?? undefined,
  );
  return { locale, messages: (await import(`../messages/${locale}.json`)).default };
});
