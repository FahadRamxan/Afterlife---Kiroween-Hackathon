import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MCP_SECTION, docHref, readmeSection } from '../../../lib/readme';

export const metadata: Metadata = { title: `${MCP_SECTION} · Afterlife` };
// The README is read when the site is built: the page is the README section, nothing else.
export const dynamic = 'force-static';

function section(): string {
  // next build and next dev run from apps/web.
  const readme = readFileSync(path.join(process.cwd(), '..', '..', 'README.md'), 'utf8');
  const s = readmeSection(readme, MCP_SECTION);
  if (!s) throw new Error(`README.md has no "## ${MCP_SECTION}" section`);
  return s;
}

const components: Components = {
  h2: ({ children }) => <h1 className="text-3xl font-semibold">{children}</h1>,
  h3: ({ children }) => <h2 className="mt-10 text-xl font-semibold">{children}</h2>,
  p: ({ children }) => <p className="mt-4 leading-relaxed text-bone/90">{children}</p>,
  ol: ({ children }) => <ol className="mt-4 list-decimal space-y-3 pl-6">{children}</ol>,
  ul: ({ children }) => <ul className="mt-4 list-disc space-y-2 pl-6">{children}</ul>,
  a: ({ href, children }) => (
    <a href={docHref(href ?? '')} className="text-ectoplasm underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ className, children }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-black/60 px-1 py-0.5 font-mono text-sm">{children}</code>
    ),
  pre: ({ children }) => (
    <pre
      tabIndex={0}
      className="mt-4 overflow-x-auto rounded-lg border border-bone/15 bg-black p-4 font-mono text-sm text-bone"
    >
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-bone/25 px-3 py-2 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-bone/10 px-3 py-2 align-top">{children}</td>,
  // A plain img: the GIF is an animation next/image would not keep.
  img: ({ src, alt }) => (
    <img
      src={docHref(String(src ?? ''))}
      alt={alt ?? ''}
      width={640}
      height={400}
      className="mt-6 h-auto w-full max-w-2xl rounded-lg border border-bone/15"
    />
  ),
};

/** /docs/mcp: the README's guide to the afterlife-emulator MCP server. */
export default function McpDocsPage() {
  return (
    <main lang="en" dir="ltr" className="mx-auto max-w-4xl px-6 py-12">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {section()}
      </Markdown>
    </main>
  );
}
