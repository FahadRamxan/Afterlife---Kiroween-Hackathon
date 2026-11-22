// The sample apps' recorded runs as Exorcist input, for tests (Prompt 73).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SoulSchema } from '@afterlife/soul';
import { tablesFromBundle } from '@afterlife/vessel';
import type { ExorcistInput, ObservedStep } from './types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
/** A sample app's recorded run: its own inferred Soul, its observations, its data files. */
export function recordedInput(app: 'shifa' | 'iqra' | 'barkat'): ExorcistInput {
  const rec = JSON.parse(readFileSync(resolve(ROOT, `apps/worker/recorded/${app}.json`), 'utf8'));
  const soul = SoulSchema.parse(rec.soul);
  const bundle = new Uint8Array(
    readFileSync(resolve(ROOT, `apps/web/public/graveyard/${app}.jsdos`)),
  );
  const manifest = JSON.parse(
    readFileSync(resolve(ROOT, `samples/graveyard/${app}/manifest.json`), 'utf8'),
  );
  return {
    soul,
    records: Object.fromEntries(
      Object.entries(tablesFromBundle(bundle, soul)).map(([f, t]) => [f, t.records]),
    ),
    observations: rec.observations as ObservedStep[],
    today: (manifest.dosTime as string).slice(0, 10),
  };
}
