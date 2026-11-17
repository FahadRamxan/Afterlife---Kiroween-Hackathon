#!/usr/bin/env node
// Runs the DOS toolchain (samples/graveyard/toolchain) in Docker. Works on Windows, macOS, Linux.
// Usage:
//   pnpm graveyard:build   compile every sample into samples/graveyard/dist
//   pnpm graveyard:test    C unit tests (gcc and 16-bit DOS in DOSBox), dist up-to-date check,
//                          and run HELLO.EXE in DOSBox (refreshes samples/graveyard/fixtures)
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const IMAGE = 'afterlife-dos-toolchain:2026-11-01';
export const COMMANDS = { build: 'toolchain/build.sh', test: 'toolchain/test.sh' };

/** Docker arguments for one toolchain command. Paths are passed as arguments, never through a shell. */
export function dockerRunArgs(graveyardDir, command) {
  const script = COMMANDS[command];
  if (!script)
    throw new Error(`Unknown command "${command}". Use: ${Object.keys(COMMANDS).join(', ')}`);
  return ['run', '--rm', '-v', `${graveyardDir}:/graveyard`, IMAGE, 'bash', script];
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
