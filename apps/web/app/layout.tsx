import type { ReactNode } from 'react';
import { inter, nastaliq, plexMono } from './fonts';
import './globals.css';

export const metadata = {
  title: 'Afterlife',
  description: 'Software that outlives its source code.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable} ${nastaliq.variable}`}>
      <body>{children}</body>
    </html>
  );
}
