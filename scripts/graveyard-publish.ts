// Publishes the dead apps for the web: one js-dos bundle per app in apps/web/public/graveyard,
// and apps/web/lib/graveyard-catalog.json for the Graveyard page. The catalogue never holds the
// hidden rules or bugs from the manifests.
// Usage: pnpm graveyard:publish   (after pnpm graveyard:build or graveyard:update)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GraveyardManifest,
  buildBundle,
  publicEntry,
  type GraveyardManifestT,
} from '@afterlife/emulator';
import { cp437ToUnicode } from '@afterlife/screen';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRAVEYARD = path.join(ROOT, 'samples', 'graveyard');

/** Graveyard order: the pharmacy (the demo app) first. */
export const APPS = ['shifa', 'iqra', 'barkat'] as const;

export const DISCLOSURE =
  'These apps were written by our team in 2026 to simulate 1990s DOS business software. ' +
  'They are real 16-bit DOS programs that write real dBASE III files.';

export function readManifest(id: string): GraveyardManifestT {
  return GraveyardManifest.parse(
    JSON.parse(readFileSync(path.join(GRAVEYARD, id, 'manifest.json'), 'utf8')),
  );
}

/** The 25 text lines of a screen dump, decoded from CP437 and padded to 80 columns. */
export function previewLines(id: string, dump: string): string[] {
  const bytes = new Uint8Array(readFileSync(path.join(GRAVEYARD, 'fixtures', id, dump)));
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < bytes.length && lines.length < 25; i++) {
    if (bytes[i] !== 0x0a) continue;
    lines.push(cp437ToUnicode(bytes.subarray(start, i)).padEnd(80));
    start = i + 1;
  }
  if (lines.length !== 25)
    throw new Error(`${id}/${dump}: expected 25 screen lines, got ${lines.length}`);
  return lines;
}

export function publishAll(): { bundles: Record<string, Uint8Array>; catalog: string } {
  const bundles: Record<string, Uint8Array> = {};
  const apps = APPS.map((id) => {
    const m = readManifest(id);
    if (m.id !== id) throw new Error(`${id}/manifest.json has id ${m.id}`);
    const files: Record<string, Uint8Array> = {};
    for (const f of [m.executable, ...m.dataFiles])
      files[f] = new Uint8Array(readFileSync(path.join(GRAVEYARD, 'dist', id, f)));
    bundles[id] = buildBundle({ executable: m.executable, files });
    return publicEntry(m, previewLines(id, m.preview));
  });
  const catalog = JSON.stringify({ disclosure: DISCLOSURE, apps }, null, 2) + '\n';
  return { bundles, catalog };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { bundles, catalog } = publishAll();
  const out = path.join(ROOT, 'apps', 'web', 'public', 'graveyard');
  mkdirSync(out, { recursive: true });
  for (const [id, bytes] of Object.entries(bundles)) {
    writeFileSync(path.join(out, `${id}.jsdos`), bytes);
    console.log(`wrote apps/web/public/graveyard/${id}.jsdos (${bytes.length} bytes)`);
  }
  writeFileSync(path.join(ROOT, 'apps', 'web', 'lib', 'graveyard-catalog.json'), catalog);
  console.log('wrote apps/web/lib/graveyard-catalog.json');
}
