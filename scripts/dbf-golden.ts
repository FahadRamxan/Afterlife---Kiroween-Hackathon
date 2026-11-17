// Writes samples/graveyard/golden/<app>/<TABLE>.DBF with @afterlife/dbf, straight from the seed
// CSVs, without the C csv2dbf tool. pnpm graveyard:test then runs every DOS scenario on these
// files in DOSBox: the 1990s apps must behave exactly as they do on the C-written files.
// Usage: pnpm dbf:golden
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  writeDbf,
  type DbfField,
  type DbfRecord,
  type DbfTable,
  type FieldType,
} from '@afterlife/dbf';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRAVEYARD = path.join(ROOT, 'samples', 'graveyard');
export const GOLDEN_APPS = ['shifa', 'iqra', 'barkat'] as const;

/** Parses our seed CSV format (# comments, a NAME:TYPE:LEN[:DEC] header, then rows). */
export function seedTable(csv: string, seedDate: string): DbfTable {
  const lines = csv
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l !== '' && !l.startsWith('#'));
  const fields: DbfField[] = lines[0]!.split(',').map((h) => {
    const [name, type, len, dec] = h.split(':');
    return {
      name: name!,
      type: type as FieldType,
      length: Number(len),
      decimals: Number(dec ?? 0),
    };
  });
  const records: DbfRecord[] = lines.slice(1).map((line) => {
    const cells = line.split(',');
    if (cells.length !== fields.length) throw new Error(`Bad seed row: ${line}`);
    return {
      deleted: false,
      values: Object.fromEntries(
        fields.map((f, i) => [f.name, cells[i] === '' && f.type !== 'C' ? null : cells[i]!]),
      ),
    };
  });
  if (!/^\d{8}$/.test(seedDate)) throw new Error(`SEED_DATE must be YYYYMMDD, got ${seedDate}`);
  const lastUpdate = {
    year: Number(seedDate.slice(0, 4)),
    month: Number(seedDate.slice(4, 6)),
    day: Number(seedDate.slice(6)),
  };
  return { fields, records, lastUpdate };
}

function seedDate(app: string): string {
  const env = readFileSync(path.join(GRAVEYARD, app, 'build.env'), 'utf8');
  return /^SEED_DATE=(\d{8})$/m.exec(env)?.[1] ?? '19980701';
}

/** "app/TABLE.DBF" -> bytes, for every seed CSV of every app. */
export function goldenFiles(): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const app of GOLDEN_APPS) {
    const dir = path.join(GRAVEYARD, app, 'seed');
    for (const csv of readdirSync(dir)
      .filter((f) => f.endsWith('.csv'))
      .sort()) {
      const table = seedTable(readFileSync(path.join(dir, csv), 'utf8'), seedDate(app));
      out[`${app}/${csv.replace(/\.csv$/, '.DBF')}`] = writeDbf(table);
    }
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [rel, bytes] of Object.entries(goldenFiles())) {
    const file = path.join(GRAVEYARD, 'golden', rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    console.log(`wrote samples/graveyard/golden/${rel} (${bytes.length} bytes)`);
  }
}
