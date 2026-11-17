import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const hooksDir = resolve(root, '.kiro/hooks');
const TRIGGERS = [
  'PreToolUse',
  'PostToolUse',
  'SessionStart',
  'Stop',
  'UserPromptSubmit',
  'PreTaskExec',
  'PostTaskExec',
  'PreCompact',
  'PostCompact',
  'PostFileCreate',
  'PostFileSave',
  'PostFileDelete',
];

type Hook = {
  name: string;
  trigger: string;
  matcher?: string;
  action: { type: string; command?: string };
};
const files = readdirSync(hooksDir).filter((f) => f.endsWith('.json'));
const hooks = Object.fromEntries(
  files.map((f) => {
    const json = JSON.parse(readFileSync(resolve(hooksDir, f), 'utf8'));
    expect(json.version).toBe('v1');
    return [f.replace(/\.json$/, ''), json.hooks[0] as Hook];
  }),
);

function runHook(name: string, event: unknown) {
  return spawnSync(process.execPath, ['scripts/hooks/run.mjs', name], {
    cwd: root,
    input: JSON.stringify(event),
    encoding: 'utf8',
  });
}

describe('.kiro/hooks files (Prompt 7)', () => {
  it('defines the four event hooks', () => {
    expect(Object.keys(hooks).sort()).toEqual(
      ['a11y-check', 'pbt-on-oracle-change', 'spec-sync', 'test-on-save'].sort(),
    );
  });

  it.each(Object.keys(hooks))(
    '%s uses a valid trigger and calls run.mjs with its own name',
    (id) => {
      const h = hooks[id]!;
      expect(TRIGGERS).toContain(h.trigger);
      expect(h.action.type).toBe('command');
      expect(h.action.command).toBe(`node scripts/hooks/run.mjs ${id}`);
    },
  );

  const matches = (id: string, p: string) => new RegExp(hooks[id]!.matcher!).test(p);

  it.each([
    ['test-on-save', 'packages/dbf/src/reader.ts', true],
    ['test-on-save', 'C:\\repo\\packages\\dbf\\src\\reader.ts', true],
    ['test-on-save', 'packages/dbf/README.md', false],
    ['test-on-save', 'apps/web/app/page.tsx', false],
    ['pbt-on-oracle-change', 'packages/oracle/src/runner.ts', true],
    ['pbt-on-oracle-change', 'C:\\repo\\packages\\vessel\\src\\x.ts', true],
    ['pbt-on-oracle-change', 'packages/dbf/src/x.ts', false],
    ['a11y-check', 'apps/web/app/graveyard/page.tsx', true],
    ['a11y-check', 'C:\\repo\\apps\\web\\app\\page.tsx', true],
    ['a11y-check', 'packages/ui/src/Button.tsx', false],
  ])('%s matcher on %s is %s', (id, p, expected) => {
    expect(matches(id, p)).toBe(expected);
  });

  it('spec-sync fires after a spec task runs', () => {
    expect(hooks['spec-sync']!.trigger).toBe('PostTaskExec');
  });

  it('pre-commit-check is a manual steering file that runs pnpm verify', () => {
    const doc = readFileSync(resolve(root, '.kiro/steering/pre-commit-check.md'), 'utf8');
    expect(doc).toMatch(/^---\r?\ninclusion: manual\r?\n---/);
    expect(doc).toContain('node scripts/hooks/run.mjs verify');
  });
});

describe('scripts/hooks/run.mjs (Prompt 7)', () => {
  it('rejects an unknown hook name', () => {
    expect(runHook('nope', {}).status).toBe(2);
  });

  it('test-on-save does nothing for a non-package file', () => {
    const r = runHook('test-on-save', { file_path: 'README.md' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('nothing to test');
  });

  it('test-on-save runs the saved package tests', () => {
    const r = runHook('test-on-save', { file_path: 'packages/dbf/src/index.ts' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('PASS @afterlife/dbf');
  });

  it('a11y-check skips non-page files', () => {
    const r = runHook('a11y-check', { file_path: 'apps/web/app/layout.tsx' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('skipped');
  });

  it('pbt-on-oracle-change skips other packages', () => {
    const r = runHook('pbt-on-oracle-change', { file_path: 'packages/dbf/src/x.ts' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('skipped');
  });

  it('spec-sync passes when every completed task is referenced', () => {
    const r = runHook('spec-sync', {});
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/completed spec task/);
  });
});
