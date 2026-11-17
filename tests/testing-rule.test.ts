import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const norm = (s: string) => s.replace(/\r\n/g, '\n');
const doc = norm(readFileSync(resolve(__dirname, '../.kiro/steering/testing-rule.md'), 'utf8'));
const examples = norm(
  readFileSync(resolve(__dirname, 'testing-rule-examples.prop.test.ts'), 'utf8'),
);

describe('.kiro/steering/testing-rule.md (Prompt 4)', () => {
  it('is always included', () => {
    expect(doc.startsWith('---\ninclusion: always\n---')).toBe(true);
  });

  it('lists the six workflow steps in order', () => {
    const steps = [
      /1\. .*Vitest.*fast-check/,
      /2\. .*pass/i,
      /3\. .*UI/,
      /4\. .*Playwright.*\/e2e/,
      /5\. .*pnpm verify/,
      /6\. .*Conventional Commit.*push/i,
    ];
    let from = 0;
    for (const s of steps) {
      const m = s.exec(doc.slice(from));
      expect(m, String(s)).not.toBeNull();
      from += m!.index + m![0].length;
    }
  });

  it('states the never-done rule', () => {
    expect(doc).toContain('Never mark a task done if any test is skipped or failing');
  });

  it.each(['Round-trip', 'Invariant', 'Differential'])('has a %s property example', (kind) => {
    expect(doc).toMatch(new RegExp(`^### ${kind}`, 'm'));
  });

  it('every ts example in the doc is real, running code in testing-rule-examples.prop.test.ts', () => {
    // Compare with whitespace collapsed, because Prettier re-indents code inside Markdown.
    const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
    const blocks = [...doc.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => squash(m[1]!));
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    for (const b of blocks) expect(squash(examples), b.slice(0, 60)).toContain(b);
  });
});
