import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Footer } from '../components/Footer';
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
      <body
        className={`flex min-h-dvh flex-col ${locale === 'ur' ? 'font-urdu leading-loose' : ''}`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TopBar />
          <div className="flex-1">{children}</div>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
