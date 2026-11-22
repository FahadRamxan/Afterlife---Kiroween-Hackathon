#!/usr/bin/env node
// Local CI. GitHub Actions is off for this repo, so this runs everything the CI jobs did.
// Usage:
//   pnpm ci:local               all steps (Docker steps only if Docker is running)
//   pnpm ci:local --only test   one step by name prefix (pnpm test:pbt uses this)
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The steps, in order. Env vars are set here (not as `VAR=x cmd`) so this works on Windows.
 * @param {{ docker: boolean }} opts
 * @returns {{ name: string, cmd: string, env: Record<string, string> }[]}
 */
export function planSteps({ docker }) {
  const steps = [
    { name: 'lint', cmd: 'pnpm lint', env: {} },
    { name: 'typecheck', cmd: 'pnpm typecheck', env: {} },
    // Whole suite, so property tests in normal *.test.ts files also get 2000 runs.
    { name: 'test (FC_NUM_RUNS=2000)', cmd: 'pnpm exec vitest run', env: { FC_NUM_RUNS: '2000' } },
    // CI=1 makes Playwright test the production build (next build && next start).
    { name: 'e2e', cmd: 'pnpm e2e', env: { CI: '1' } },
    // Prompt 62: Shifa's export, unzipped outside the repo, installs, passes its tests and builds.
    { name: 'export', cmd: 'pnpm export:check', env: {} },
    // Prompt 68: the Oracle's proof, 200 cases on the real Shifa in js-dos against the Vessel.
    { name: 'proof', cmd: 'pnpm proof:shifa', env: {} },
  ];
  if (docker) {
    steps.push(
      {
        name: 'docker build api',
        cmd: 'docker build -q -f apps/api/Dockerfile -t afterlife-api:local .',
        env: {},
      },
      {
        name: 'docker build worker',
        cmd: 'docker build -q -f apps/worker/Dockerfile -t afterlife-worker:local .',
        env: {},
      },
      { name: 'docker smoke', cmd: 'node scripts/docker-smoke.mjs', env: {} },
      // Open Watcom + DOSBox: C tests on gcc and 16-bit DOS, dist/ up to date, HELLO.EXE runs.
      { name: 'graveyard toolchain', cmd: 'pnpm graveyard:test', env: {} },
    );
  }
  return steps;
}

/** @param {number} ms */
export function formatDuration(ms) {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** @param {{ name: string, ok: boolean, ms: number }[]} results */
export function summarize(results) {
  return {
    ok: results.every((r) => r.ok),
    lines: results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${formatDuration(r.ms)}`),
  };
}

function dockerRunning() {
  return spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : undefined;
  const docker = only ? true : dockerRunning();
  let steps = planSteps({ docker });
  if (only) steps = steps.filter((s) => s.name.startsWith(only));
  if (!steps.length) {
    console.error(`No step matches "${only}".`);
    process.exit(2);
  }
  if (!only && !docker) console.log('Docker is not running: skipping the Docker steps.');

  const results = [];
  for (const step of steps) {
    console.log(`\n=== ${step.name}: ${step.cmd}`);
    const start = Date.now();
    const r = spawnSync(step.cmd, {
      cwd: root,
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, ...step.env },
    });
    results.push({ name: step.name, ok: r.status === 0, ms: Date.now() - start });
    // Keep going after a failure, so one run reports every broken step.
  }
  const { ok, lines } = summarize(results);
  console.log(
    `\n=== ci:local summary\n${lines.join('\n')}\n${ok ? 'ci:local PASSED' : 'ci:local FAILED'}`,
  );
  process.exit(ok ? 0 : 1);
}
