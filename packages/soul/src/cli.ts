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
const soul = from === '--example' ? SHIFA_REFERENCE_SOUL : parseSoul(readFileSync(from, 'utf8'));
for (const [path, text] of Object.entries(writeKiroSpec(soul))) {
  const file = resolve(to, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  console.log(`wrote ${file}`);
}
