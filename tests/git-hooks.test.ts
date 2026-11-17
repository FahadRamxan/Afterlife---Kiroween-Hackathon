import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import lint from '@commitlint/lint';
import load from '@commitlint/load';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');

async function check(message: string) {
  const config = await load({}, { cwd: root });
  return lint(message, config.rules, { parserOpts: config.parserPreset?.parserOpts as never });
}

describe('git hooks (Prompt 5)', () => {
  it.each([
    'feat(dbf): reader',
    'chore: git hooks',
    'fix(oracle): shrink money cases',
    'docs: kiro formats',
  ])('commitlint accepts "%s"', async (msg) => {
    expect((await check(msg)).valid).toBe(true);
  });

  it.each(['added stuff', 'Feat: Reader', 'feat:missing space', 'wip'])(
    'commitlint rejects "%s"',
    async (msg) => {
      expect((await check(msg)).valid).toBe(false);
    },
  );

  it('pre-commit runs lint-staged, typecheck and tests for changed packages', () => {
    const hook = read('.husky/pre-commit');
    expect(hook).toContain('lint-staged');
    expect(hook).toContain('pnpm typecheck');
    expect(hook).toContain('--filter=...[HEAD]');
    expect(hook).toMatch(/vitest run/);
  });

  it('pre-push runs pnpm verify (with e2e)', () => {
    expect(read('.husky/pre-push')).toContain('pnpm verify');
  });

  it('commit-msg runs commitlint', () => {
    expect(read('.husky/commit-msg')).toContain('commitlint --edit');
  });

  it('package.json installs husky on prepare and configures lint-staged', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts.prepare).toBe('husky');
    expect(pkg['lint-staged']).toBeDefined();
  });

  it('CONTRIBUTING.md explains the loop with a checklist', () => {
    const c = read('CONTRIBUTING.md');
    for (const step of ['test', 'wire', 'commit', 'push']) expect(c.toLowerCase()).toContain(step);
    expect(c.match(/^- \[ \]/gm)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });

  it('the blocked-commit proof is recorded in docs', () => {
    expect(existsSync(resolve(root, 'docs/git-hooks-proof.md'))).toBe(true);
  });
});
