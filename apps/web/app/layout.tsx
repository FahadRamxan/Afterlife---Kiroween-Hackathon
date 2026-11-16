import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { TopBar } from '../components/TopBar';
import { dirFor, type Locale } from '../lib/i18n';
import { inter, nastaliq, plexMono } from './fonts';
import './globals.css';

export const metadata = {
  title: 'Afterlife',
  description: 'Software that outlives its source code.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = (await getLocale()) as Locale;
  const messages = await getMessages();
  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${inter.variable} ${plexMono.variable} ${nastaliq.variable}`}
    >
      <body className={locale === 'ur' ? 'font-urdu leading-loose' : undefined}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TopBar />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
