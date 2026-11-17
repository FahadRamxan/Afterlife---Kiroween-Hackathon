// Readers for the files the DOS toolchain writes: CSV dumps of .DBF files (toolchain/tools/dbf2csv)
// and screen dumps (*.SCR, from the scripted test builds).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const GRAVEYARD = resolve(__dirname, '../../samples/graveyard');

export type Field = { name: string; type: string; len: number; dec: number };
export type Table = { fields: Field[]; rows: Record<string, string>[]; deleted: boolean[] };

/** Parses our CSV format: "#" comment lines, a NAME:TYPE:LEN[:DEC] header, then plain rows. */
export function parseCsv(text: string): Table {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l !== '' && !l.startsWith('#'));
  const [header, ...rows] = lines;
  if (!header) throw new Error('CSV has no header');
  const cols = header.split(',').map((h) => {
    const [name, type, len, dec] = h.split(':');
    return { name: name!, type: type!, len: Number(len), dec: Number(dec ?? 0) };
  });
  const hasDel = cols[0]?.name === '_DEL';
  const fields = hasDel ? cols.slice(1) : cols;
  const table: Table = { fields, rows: [], deleted: [] };
  for (const line of rows) {
    const values = line.split(',');
    if (values.length !== cols.length) throw new Error(`Bad CSV row: ${line}`);
    const flag = hasDel ? values.shift() : '';
    table.deleted.push(flag === '*');
    table.rows.push(Object.fromEntries(fields.map((f, i) => [f.name, values[i]!])));
  }
  return table;
}

export function readTable(path: string): Table {
  return parseCsv(readFileSync(resolve(GRAVEYARD, path), 'latin1'));
}

export type Screen = { text: string[]; attr: string[][]; all: string };

/** A screen dump: 25 text lines, a "--ATTR--" line, then 25 lines of 80 two-digit hex attributes. */
export function readScreen(path: string): Screen {
  const lines = readFileSync(resolve(GRAVEYARD, path), 'latin1').replace(/\r\n/g, '\n').split('\n');
  const sep = lines.indexOf('--ATTR--');
  if (sep !== 25) throw new Error(`${path}: expected 25 text lines, got ${sep}`);
  const text = lines.slice(0, 25);
  const attr = lines.slice(26, 51).map((l) => l.match(/.{2}/g) ?? []);
  return { text, attr, all: text.join('\n') };
}

/** Scenario names that have a fixture folder for an app. */
export function scenarios(app: string): string[] {
  const dir = resolve(GRAVEYARD, 'fixtures', app);
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

export function readText(path: string): string {
  return readFileSync(resolve(GRAVEYARD, path), 'latin1').replace(/\r\n/g, '\n');
}
