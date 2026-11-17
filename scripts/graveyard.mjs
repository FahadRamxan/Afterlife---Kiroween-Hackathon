#!/usr/bin/env node
// Runs the DOS toolchain (samples/graveyard/toolchain) in Docker. Works on Windows, macOS, Linux.
// Usage:
//   pnpm graveyard:build   compile every sample into samples/graveyard/dist
//   pnpm graveyard:test    C unit tests (gcc and 16-bit DOS in DOSBox), dist up-to-date check,
//                          and every scripted scenario in DOSBox, compared with fixtures/
//   pnpm graveyard:update  the same, but rewrites fixtures/ (review the diff, then commit)
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const IMAGE = 'afterlife-dos-toolchain:2026-11-01';
export const COMMANDS = {
  build: { script: 'toolchain/build.sh', env: [] },
  test: { script: 'toolchain/test.sh', env: [] },
  update: { script: 'toolchain/test.sh', env: ['UPDATE_FIXTURES=1'] },
};

/** Docker arguments for one toolchain command. Paths are passed as arguments, never through a shell. */
export function dockerRunArgs(graveyardDir, command) {
  // Object.hasOwn: a name like "constructor" must not match something on Object.prototype.
  const c = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  if (!c) throw new Error(`Unknown command "${command}". Use: ${Object.keys(COMMANDS).join(', ')}`);
  const env = c.env.flatMap((e) => ['-e', e]);
  return ['run', '--rm', ...env, '-v', `${graveyardDir}:/graveyard`, IMAGE, 'bash', c.script];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const graveyard = path.join(root, 'samples', 'graveyard');
  const command = process.argv[2];
  let args;
  try {
    args = dockerRunArgs(graveyard, command);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const build = spawnSync(
    'docker',
    ['build', '-q', '-t', IMAGE, path.join(graveyard, 'toolchain')],
    {
      stdio: ['ignore', 'ignore', 'inherit'],
    },
  );
  if (build.status !== 0) process.exit(build.status ?? 1);
  const r = spawnSync('docker', args, { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
