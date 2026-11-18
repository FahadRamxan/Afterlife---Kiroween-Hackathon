import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
  timeout?: number;
  action: { type: string; command?: string; timeout?: number };
};
const files = readdirSync(hooksDir).filter((f) => f.endsWith('.json'));
const hooks = Object.fromEntries(
  files.map((f) => {
    const json = JSON.parse(readFileSync(resolve(hooksDir, f), 'utf8'));
    expect(json.version).toBe('v1');
    return [f.replace(/\.json$/, ''), json.hooks[0] as Hook];
  }),
);

const hookLog = join(mkdtempSync(join(tmpdir(), 'afterlife-hooks-')), 'runs.jsonl');

function runHook(name: string, event: unknown) {
  return spawnSync(process.execPath, ['scripts/hooks/run.mjs', name], {
    cwd: root,
    input: JSON.stringify(event),
    encoding: 'utf8',
    env: { ...process.env, AFTERLIFE_HOOK_SOURCE: 'test', AFTERLIFE_HOOK_LOG: hookLog },
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

  // kiro.dev/docs/hooks lists hooks[].timeout; Kiro's createHook tool writes action.timeout.
  // Both are set to the same value until the Hooks panel shows which one the IDE reads.
  it.each(Object.keys(hooks))('%s sets the same timeout at hook and action level', (id) => {
    const h = hooks[id]!;
    expect(h.timeout).toBeGreaterThan(0);
    expect(h.action.timeout).toBe(h.timeout);
  });

  it('long hooks get more than the 60 s default', () => {
    expect(hooks['a11y-check']!.timeout).toBeGreaterThanOrEqual(300);
    expect(hooks['pbt-on-oracle-change']!.timeout).toBeGreaterThanOrEqual(300);
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

// These tests start a real Vitest run of a package (FC_NUM_RUNS=2000 in ci:local), which takes
// longer than the 5 s default when the machine is busy.
describe('scripts/hooks/run.mjs with real Kiro paths (review fix)', { timeout: 60_000 }, () => {
  // Uses the real repo path, which has spaces in "Matrix AE Hackathons" but not in other clones
  // (the Crew nightly runs in C:\dev\afterlife-nightly). Paths with spaces are pinned in
  // tests/hooks-lib.test.ts with a fixed root, so this must not depend on where the repo lives.
  it('test-on-save runs the package for an absolute path to the repo', () => {
    const abs = resolve(root, 'packages/dbf/src/index.ts');
    const r = runHook('test-on-save', { file_path: abs });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('PASS @afterlife/dbf');
  });

  it('test-on-save runs the package for a file:// URI', () => {
    const uri =
      'file:///' +
      resolve(root, 'packages/dbf/src/index.ts').replace(/\\/g, '/').replace(/ /g, '%20');
    const r = runHook('test-on-save', { uri });
    expect(r.stdout).toContain('PASS @afterlife/dbf');
  });

  it('logs each run with source "test" (and "kiro" by default)', () => {
    runHook('spec-sync', {});
    const last = JSON.parse(readFileSync(hookLog, 'utf8').trim().split('\n').at(-1)!);
    expect(last).toMatchObject({ hook: 'spec-sync', source: 'test', ok: true });
  });
});
