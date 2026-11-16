import type { ReactNode } from 'react';

export const metadata = {
  title: 'Afterlife',
  description: 'Software that outlives its source code.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
