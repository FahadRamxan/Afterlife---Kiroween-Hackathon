// pnpm export:check (Prompt 62, a ci:local step): the export of Shifa's reference Soul, unzipped
// into an empty folder outside the repo, must pass its own `pnpm install && pnpm test` (the
// TypeScript check of the app and the runtime, then its property suite), and `pnpm build`.
//
// Usage: pnpm export:check            build, install, test, then delete the folder
//        pnpm export:check --keep     leave the folder, and print where it is
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import { unzipSync } from 'fflate';
import { exportOf } from '../apps/api/src/export';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Unzips an export into `dir`. Gives the app's own folder. */
export function unzipTo(zip: Uint8Array, dir: string): string {
  let root = '';
  for (const [p, bytes] of Object.entries(unzipSync(zip))) {
    const out = path.join(dir, ...p.split('/'));
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, bytes);
    root ||= p.split('/')[0]!;
  }
  return path.join(dir, root);
}

function run(cmd: string, cwd: string): boolean {
  console.log(`\n$ ${cmd}   (in ${cwd})`);
  const r = spawnSync(cmd, {
    cwd,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, CI: '1' },
  });
  return r.status === 0;
}

function main() {
  const bundle = new Uint8Array(
    readFileSync(path.join(ROOT, 'apps', 'web', 'public', 'graveyard', 'shifa.jsdos')),
  );
  const { zip } = exportOf(SHIFA_REFERENCE_SOUL, bundle, '1998-07-15');
  const dir = mkdtempSync(path.join(tmpdir(), 'afterlife-export-'));
  const app = unzipTo(zip, dir);
  console.log(`Shifa's export: ${(zip.length / 1024).toFixed(0)} KiB, unzipped in ${app}`);
  // Outside the repo, so not part of its workspace; the store on this machine has the packages.
  const ok =
    run(
      'pnpm install --prefer-offline --ignore-workspace --config.confirmModulesPurge=false',
      app,
    ) &&
    run('pnpm test', app) &&
    run('pnpm build', app);
  if (process.argv.includes('--keep')) console.log(`\nKept: ${app}`);
  else rmSync(dir, { recursive: true, force: true });
  console.log(ok ? '\nThe export passes its own tests.' : '\nThe export FAILED its own tests.');
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
