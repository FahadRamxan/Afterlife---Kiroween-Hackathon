// Runs the worker's real ClamAV scanner on two zips: one with the EICAR test file (must be found,
// inside the archive) and the real Shifa app (must be clean). The Docker smoke test runs this
// inside the worker image (pnpm ci:local).
//   node --import tsx src/smoke-scan.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { ClamAvScanner, EICAR } from './scanner';

// The files of the real Shifa app, from its js-dos bundle (samples/*/dist is not in the image).
const bundle = unzipSync(
  new Uint8Array(
    readFileSync(fileURLToPath(new URL('../../web/public/graveyard/shifa.jsdos', import.meta.url))),
  ),
);
const file = (n: string) => bundle[n]!;

const scanner = new ClamAvScanner();
const shifa = zipSync({ 'SHIFA.EXE': file('SHIFA.EXE'), 'MEDICINE.DBF': file('MEDICINE.DBF') });
const dirty = zipSync({ 'SHIFA.EXE': file('SHIFA.EXE'), 'README.TXT': strToU8(EICAR) });
try {
  const a = await scanner.scan(dirty);
  const b = await scanner.scan(shifa);
  if (a.clean) throw new Error('ClamAV did not find the EICAR test file in the zip');
  if (!b.clean) throw new Error(`ClamAV flagged the Shifa app: ${b.finding}`);
  console.log(`SMOKE SCAN OK eicar=${a.finding} shifa=clean`);
} catch (e) {
  console.error(`SMOKE SCAN FAILED ${(e as Error).message}`);
  process.exit(1);
}
