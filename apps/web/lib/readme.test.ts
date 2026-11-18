import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MCP_SECTION, REPO_URL, docHref, readmeSection } from './readme';

const md = `# Title

## One

text one

### Sub

more

## Two

text two
`;

describe('readmeSection', () => {
  it('is the section from its heading up to the next ## heading, subsections included', () => {
    expect(readmeSection(md, 'One')).toBe('## One\n\ntext one\n\n### Sub\n\nmore\n');
    expect(readmeSection(md, 'Two')).toBe('## Two\n\ntext two\n');
  });

  it('is null for a heading that is not there', () => {
    expect(readmeSection(md, 'Three')).toBeNull();
  });

  it('the real README has the MCP guide, with install steps, the tools and the GIF', () => {
    const readme = readFileSync(resolve(__dirname, '../../../README.md'), 'utf8');
    const s = readmeSection(readme, MCP_SECTION)!;
    expect(s).toContain('### Install');
    expect(s).toContain('### Tools');
    expect(s).toContain('apps/web/public/mcp/afterlife-mcp.gif');
  });
});

describe('docHref (README links on the web page)', () => {
  it('files the site serves become site paths', () => {
    expect(docHref('apps/web/public/mcp/afterlife-mcp.gif')).toBe('/mcp/afterlife-mcp.gif');
  });

  it('other repo paths link to the file on GitHub', () => {
    expect(docHref('docs/progress.md')).toBe(`${REPO_URL}/blob/main/docs/progress.md`);
    expect(docHref('./LICENSE')).toBe(`${REPO_URL}/blob/main/LICENSE`);
  });

  it('web links and anchors stay as they are; other schemes are dropped', () => {
    expect(docHref('https://kiro.dev/docs/mcp')).toBe('https://kiro.dev/docs/mcp');
    expect(docHref('#install')).toBe('#install');
    expect(docHref('javascript:alert(1)')).toBe('');
    expect(docHref('data:text/html,x')).toBe('');
  });
});
