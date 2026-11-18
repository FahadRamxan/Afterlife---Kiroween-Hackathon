/** The public repo, for README links to files the site does not serve. */
export const REPO_URL = 'https://github.com/FahadRamxan/Afterlife---Kiroween-Hackathon';

/** The README section /docs/mcp renders (one source for both). */
export const MCP_SECTION = "Use Afterlife's emulator from your own Kiro";

/** A "## heading" section of a Markdown file, up to the next "## " heading. */
export function readmeSection(markdown: string, heading: string): string | null {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => l === `## ${heading}`);
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = lines.length;
  return lines.slice(start, end).join('\n').replace(/\n+$/, '\n');
}

/**
 * A README link as it works on the web page: files under apps/web/public are served by the site,
 * other repo files link to GitHub, web links and anchors stay. Anything else (javascript:, data:)
 * becomes an empty link.
 */
export function docHref(href: string): string {
  if (href.startsWith('#') || /^https?:\/\//.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return '';
  const path = href.replace(/^\.\//, '');
  if (path.startsWith('apps/web/public/')) return `/${path.slice('apps/web/public/'.length)}`;
  return `${REPO_URL}/blob/main/${path}`;
}
