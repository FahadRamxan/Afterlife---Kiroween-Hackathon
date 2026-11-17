import { IBM_Plex_Mono, Inter, Noto_Nastaliq_Urdu } from 'next/font/google';

export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const nastaliq = Noto_Nastaliq_Urdu({
  subsets: ['arabic'],
  weight: ['400', '700'],
  variable: '--font-nastaliq',
  display: 'swap',
});
