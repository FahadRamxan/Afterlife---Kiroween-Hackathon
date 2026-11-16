import type { ReactNode } from 'react';

export function PageShell({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-semibold">{title}</h1>
      {children}
    </main>
  );
}
