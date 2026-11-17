import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatDuration, planSteps, summarize } from '../scripts/ci-local.mjs';
import { COMMANDS, IMAGE, dockerRunArgs } from '../scripts/graveyard.mjs';
import { smokeArgs } from '../scripts/smoke-prod.mjs';

const root = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
const scripts = JSON.parse(read('package.json')).scripts;

describe('pnpm ci:local (review fix)', () => {
  it('is a root script', () => {
    expect(scripts['ci:local']).toBe('node scripts/ci-local.mjs');
  });

  it('runs lint, typecheck, tests (2000 runs), e2e, then the Docker checks, in order', () => {
    expect(planSteps({ docker: true }).map((s) => s.name)).toEqual([
      'lint',
      'typecheck',
      'test (FC_NUM_RUNS=2000)',
      'e2e',
      'docker build api',
      'docker build worker',
      'docker smoke',
      'graveyard toolchain',
    ]);
  });

  it('the graveyard step runs the DOS toolchain test', () => {
    expect(planSteps({ docker: true }).at(-1)!.cmd).toBe('pnpm graveyard:test');
  });

  it('sets FC_NUM_RUNS through env, not shell syntax, so it works on Windows', () => {
    const test = planSteps({ docker: false }).find((s) => s.name.startsWith('test'))!;
    expect(test.env).toEqual({ FC_NUM_RUNS: '2000' });
    expect(test.cmd).not.toMatch(/FC_NUM_RUNS=/);
  });

  it('runs e2e against the production build, like CI did', () => {
    expect(planSteps({ docker: false }).find((s) => s.name === 'e2e')!.env).toEqual({ CI: '1' });
  });

  it('skips the Docker steps when Docker is not running', () => {
    expect(planSteps({ docker: false }).map((s) => s.name)).toEqual([
      'lint',
      'typecheck',
      'test (FC_NUM_RUNS=2000)',
      'e2e',
    ]);
  });

  it('prints one line per step with its time, and fails if any step failed', () => {
    const ok = summarize([
      { name: 'lint', ok: true, ms: 1200 },
      { name: 'e2e', ok: true, ms: 65_000 },
    ]);
    expect(ok.ok).toBe(true);
    expect(ok.lines).toEqual(['PASS  lint  1.2s', 'PASS  e2e  1m 5s']);

    const bad = summarize([
      { name: 'lint', ok: true, ms: 1000 },
      { name: 'test', ok: false, ms: 3000 },
    ]);
    expect(bad.ok).toBe(false);
    expect(bad.lines.at(-1)).toBe('FAIL  test  3.0s');
  });

  it('formats durations', () => {
    expect(formatDuration(450)).toBe('0.5s');
    expect(formatDuration(59_999)).toBe('60.0s');
    expect(formatDuration(125_000)).toBe('2m 5s');
  });

  it('test:pbt runs the whole suite with 2000 runs, not only *.prop.test files', () => {
    expect(scripts['test:pbt']).toBe('node scripts/ci-local.mjs --only test');
  });
});

describe('pnpm smoke:prod <url> (review fix)', () => {
  it('is a root script', () => {
    expect(scripts['smoke:prod']).toBe('node scripts/smoke-prod.mjs');
  });

  it('passes the URL as BASE_URL', () => {
    expect(smokeArgs(['https://afterlife.vercel.app'])).toEqual({
      BASE_URL: 'https://afterlife.vercel.app',
    });
  });

  it.each([[[]], [['not-a-url']], [['ftp://x.example']], [['https://a', 'extra']]])(
    'rejects %j',
    (argv) => {
      expect(() => smokeArgs(argv)).toThrow(/Usage: pnpm smoke:prod <https:\/\/url>/);
    },
  );

  it('exits with usage and code 2 when no URL is given', () => {
    const r = spawnSync(process.execPath, ['scripts/smoke-prod.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Usage: pnpm smoke:prod');
  });
});

describe('config fixes (review)', () => {
  it('turbo passes the env that e2e needs through strict mode', () => {
    const e2e = JSON.parse(read('turbo.json')).tasks.e2e;
    expect(e2e.passThroughEnv).toEqual([
      'PLAYWRIGHT_BROWSERS_PATH',
      'CI',
      'BASE_URL',
      'DATABASE_URL',
    ]);
  });

  it('pre-commit runs the tests once, not twice', () => {
    const hook = read('.husky/pre-commit');
    expect(hook.match(/vitest run|turbo run test/g)).toHaveLength(1);
  });

  it('.node-version pins Node 22', () => {
    expect(read('.node-version').trim()).toBe('22');
  });
});

describe('.gitignore (review fix)', () => {
  const ignored = (p: string) =>
    spawnSync('git', ['check-ignore', '-q', p], { cwd: root }).status === 0;

  it.each([
    'debug.log',
    '.DS_Store',
    '.env',
    '.env.local',
    '.env.production',
    '.vercel/project.json',
    'apps/web/.env.local',
  ])('ignores %s', (p) => {
    expect(ignored(p)).toBe(true);
  });

  it.each([
    'apps/api/.env.example',
    'apps/web/.env.example',
    '.kiro/steering/tech.md',
    'samples/graveyard/dist/hello/HELLO.EXE',
  ])('does not ignore %s', (p) => {
    expect(ignored(p)).toBe(false);
  });
});

describe('pnpm graveyard:build / graveyard:test (Prompt 11)', () => {
  it('are root scripts', () => {
    expect(scripts['graveyard:build']).toBe('node scripts/graveyard.mjs build');
    expect(scripts['graveyard:test']).toBe('node scripts/graveyard.mjs test');
  });

  it('mounts the graveyard folder and runs the matching script, with paths as separate arguments', () => {
    const dir = 'C:\\Users\\fahad\\Matrix AE Hackathons\\x\\samples\\graveyard';
    expect(dockerRunArgs(dir, 'build')).toEqual([
      'run',
      '--rm',
      '-v',
      `${dir}:/graveyard`,
      IMAGE,
      'bash',
      'toolchain/build.sh',
    ]);
    expect(dockerRunArgs(dir, 'test').at(-1)).toBe('toolchain/test.sh');
  });

  it('rejects unknown commands', () => {
    expect(() => dockerRunArgs('/x', 'rm -rf /')).toThrow(/Unknown command/);
    expect(Object.keys(COMMANDS)).toEqual(['build', 'test']);
  });

  it('pins the image tag to the Open Watcom release date', () => {
    expect(IMAGE).toBe('afterlife-dos-toolchain:2026-11-01');
    expect(readFileSync(resolve(root, 'samples/graveyard/toolchain/Dockerfile'), 'utf8')).toContain(
      '2026-11-01-Build',
    );
  });
});
