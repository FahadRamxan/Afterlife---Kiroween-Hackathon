// pnpm soul:spec <soul.json | --example shifa> <out-dir>
// Writes the Kiro spec of a Soul (Prompt 43) into a folder: open that folder in Kiro to use it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SHIFA_REFERENCE_SOUL } from './examples/shifa';
import { parseSoul } from './ir';
import { writeKiroSpec } from './spec-writer';

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error('Usage: pnpm soul:spec <soul.json | --example> <out-dir>');
  process.exit(2);
}
// `pnpm soul:spec` runs in packages/soul, so paths are taken from where it was typed (INIT_CWD).
const here = process.env.INIT_CWD ?? process.cwd();
const soul =
  from === '--example'
    ? SHIFA_REFERENCE_SOUL
    : parseSoul(readFileSync(resolve(here, from), 'utf8'));
for (const [path, text] of Object.entries(writeKiroSpec(soul))) {
  const file = resolve(here, to, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  console.log(`wrote ${file}`);
}
