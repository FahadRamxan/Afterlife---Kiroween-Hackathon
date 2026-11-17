// Node-only helpers. Import from '@afterlife/dbf/node'.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { snapshot, type Snapshot } from './diff';

/** Snapshots every .DBF file in a folder (not its subfolders). */
export function snapshotDir(dir: string): Promise<Snapshot> {
  const files: Record<string, Uint8Array> = {};
  for (const name of readdirSync(dir)) {
    if (!/\.dbf$/i.test(name)) continue;
    files[name] = new Uint8Array(readFileSync(path.join(dir, name)));
  }
  return snapshot(files);
}
