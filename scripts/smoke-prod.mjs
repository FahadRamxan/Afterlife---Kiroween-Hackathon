#!/usr/bin/env node
// Runs the Playwright tests tagged @smoke against a deployed site. Replaces the prod-smoke workflow.
// Usage: pnpm smoke:prod https://afterlife.vercel.app
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = 'Usage: pnpm smoke:prod <https://url>';

/**
 * Validates the CLI arguments and returns the env for Playwright.
 * @param {string[]} argv
 */
export function smokeArgs(argv) {
  if (argv.length !== 1) throw new Error(USAGE);
  let url;
  try {
    url = new URL(argv[0]);
  } catch {
    throw new Error(USAGE);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(USAGE);
  return { BASE_URL: argv[0].replace(/\/+$/, '') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let env;
  try {
    env = smokeArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  console.log(`Running @smoke tests against ${env.BASE_URL}`);
  const r = spawnSync('pnpm --filter @afterlife/e2e exec playwright test', {
    cwd: root,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  process.exit(r.status ?? 1);
}
