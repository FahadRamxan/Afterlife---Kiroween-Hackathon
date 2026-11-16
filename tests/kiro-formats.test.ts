import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const doc = readFileSync(resolve(__dirname, '../docs/kiro-formats.md'), 'utf8');

describe('docs/kiro-formats.md (Prompt 2)', () => {
  it.each([
    'Steering',
    'Specs',
    'Hooks',
    'Custom agents',
    'Kiro Crew',
    'MCP',
    'Powers',
    'Property-based testing',
  ])('has a section for %s', (h) => {
    expect(doc).toMatch(new RegExp(`^## ${h}`, 'm'));
  });

  it.each([
    '.kiro/steering',
    '.kiro/specs',
    '.kiro/hooks',
    '.kiro/agents',
    '.kiro/settings/mcp.json',
    'plugin.json',
  ])('documents the path %s', (p) => {
    expect(doc).toContain(p);
  });

  it('has a Differences from plan.md section', () => {
    expect(doc).toMatch(/^## Differences from plan\.md/m);
  });

  it('every section has a minimal example in a code block', () => {
    // Split on level-2 headings that are outside code fences.
    const sections: string[] = [];
    let inFence = false;
    for (const line of doc.split(/\r?\n/)) {
      if (line.startsWith('```')) inFence = !inFence;
      if (!inFence && line.startsWith('## ')) sections.push('');
      if (sections.length) sections[sections.length - 1] += line.replace(/^## /, '') + '\n';
    }
    const checked = sections.filter(
      (s) => !s.startsWith('Differences') && !s.startsWith('Sources'),
    );
    expect(checked.length).toBe(8);
    for (const s of checked) expect(s, s.slice(0, 30)).toContain('```');
  });
});
