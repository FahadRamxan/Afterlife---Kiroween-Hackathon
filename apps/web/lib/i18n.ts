export const LOCALES = ['en', 'ur'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'afterlife-locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ur' ? 'rtl' : 'ltr';
}

/** Locale from the cookie if valid, else the first supported Accept-Language entry, else English. */
export function resolveLocale(
  cookie: string | undefined,
  acceptLanguage: string | undefined,
): Locale {
  if (isLocale(cookie)) return cookie;
  for (const part of (acceptLanguage ?? '').split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase().split('-')[0];
    if (isLocale(tag)) return tag;
  }
  return DEFAULT_LOCALE;
}
