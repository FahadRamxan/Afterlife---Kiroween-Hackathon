// Test data: Shifa Medical Store as our team wrote it (samples/graveyard/shifa), and what the real
// app did in DOSBox for each scripted scenario (samples/graveyard/fixtures/shifa, from
// `pnpm graveyard:test`). Both are kept as CSV dumps of the .DBF files.
import { readFileSync } from 'node:fs';
import type { DbfField, DbfRecord } from '@afterlife/dbf';
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import { MemoryEntityStore } from '../store';

const ROOT = new URL('../../../../samples/graveyard/', import.meta.url);
export const SHIFA = SHIFA_REFERENCE_SOUL;
export const SHIFA_FILES = SHIFA.entities.map((e) => e.file);
/** The PC's clock in every scripted run. */
export const SHIFA_TODAY = '1998-07-15';

export type CsvTable = { fields: DbfField[]; records: DbfRecord[] };

/** Our CSV dump format: "#" comments, a NAME:TYPE:LEN[:DEC] header, then rows. */
export function readCsv(path: string): CsvTable {
  const lines = readFileSync(new URL(path, ROOT), 'latin1')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l !== '' && !l.startsWith('#'));
  const cols = lines[0]!.split(',').map((h) => {
    const [name, type, len, dec] = h.split(':');
    return {
      name: name!,
      type: type as DbfField['type'],
      length: Number(len),
      decimals: Number(dec ?? 0),
    };
  });
  const hasDel = cols[0]?.name === '_DEL';
  const fields = hasDel ? cols.slice(1) : cols;
  const records = lines.slice(1).map((line) => {
    const cells = line.split(',');
    const flag = hasDel ? cells.shift() : '';
    return {
      deleted: flag === '*',
      values: Object.fromEntries(
        fields.map((f, i) => [
          f.name,
          f.type === 'C' ? cells[i]! : cells[i] === '' ? null : cells[i]!,
        ]),
      ),
    };
  });
  return { fields, records };
}

const base = (file: string) => file.replace(/\.DBF$/, '');
/** The seed data, the way the shop's files were on 1 July 1998. */
export const shifaSeed = (file: string) => readCsv(`shifa/seed/${base(file)}.csv`);
/** The data after the real app ran a scenario. */
export const shifaAfter = (scenario: string, file: string) =>
  readCsv(`fixtures/shifa/${scenario}/${base(file)}.csv`);

/** A store with Shifa's seed data. */
export async function shifaStore(): Promise<MemoryEntityStore> {
  const s = new MemoryEntityStore();
  for (const f of SHIFA_FILES) await s.load(f, shifaSeed(f).records);
  return s;
}
