// @spec claude-api#1.3 pnpm llm:smoke (Prompt 80a): one real call with a key, a clean skip without.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const ROOT = resolve(__dirname, '..');
describe('pnpm llm:smoke', () => {
  it('reads the worker’s .env', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['llm:smoke']).toBe(
      'tsx --env-file-if-exists=apps/worker/.env scripts/llm-smoke.ts',
    );
  });
  it('skips, and exits 0, with no ANTHROPIC_API_KEY', () => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !/^(ANTHROPIC_|NODE_OPTIONS|VITEST)/.test(k)),
    );
    const out = execFileSync(
      process.execPath,
      ['--import', 'tsx', resolve(ROOT, 'scripts/llm-smoke.ts')],
      { cwd: ROOT, env, encoding: 'utf8' },
    );
    expect(out.trim()).toBe('llm:smoke skipped: no ANTHROPIC_API_KEY (add it to apps/worker/.env)');
  }, 60_000);
});
