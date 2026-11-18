// The Graveyard apps, read from this repo: each manifest gives the name and DOS clock, and the
// published js-dos bundle is the program with its data files.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppSource } from './server';

/** The repo root: AFTERLIFE_ROOT, else three folders up from this file (packages/mcp-emulator/src). */
export function repoRoot(env: Record<string, string | undefined> = process.env): string {
  return resolve(
    env.AFTERLIFE_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
  );
}

export function graveyardApps(root = repoRoot()): Record<string, AppSource> {
  const graveyard = join(root, 'samples', 'graveyard');
  const apps: Record<string, AppSource> = {};
  for (const id of readdirSync(graveyard).sort()) {
    const manifest = join(graveyard, id, 'manifest.json');
    const bundle = join(root, 'apps', 'web', 'public', 'graveyard', `${id}.jsdos`);
    if (!existsSync(manifest) || !existsSync(bundle)) continue;
    const m = JSON.parse(readFileSync(manifest, 'utf8')) as { name: string; dosTime: string };
    apps[id] = {
      name: m.name,
      dosTime: m.dosTime,
      bundle: async () => new Uint8Array(await readFile(bundle)),
    };
  }
  return apps;
}
