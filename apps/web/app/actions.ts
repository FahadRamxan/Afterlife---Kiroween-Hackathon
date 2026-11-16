'use server';

import { cookies } from 'next/headers';
import { LOCALE_COOKIE, isLocale } from '../lib/i18n';

/** Saves the chosen language. Input comes from the browser, so it is validated. */
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) throw new Error('Unsupported locale');
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
  });
}
