import { readDbf } from './reader';
import type { DbfField, DbfRecord, DbfWarning } from './types';

/** How many records the inspector returns per file. */
export const INSPECT_ROWS = 100;

/** A quick look at one .DBF: its schema and the first rows. JSON-safe. */
export type InspectedTable = {
  /** Version byte: 0x03 dBASE III or Clipper, 0x83 with memo, 0xF5 FoxPro 2.x. */
  version: number;
  /** YYYY-MM-DD from the header. */
  lastUpdate: string;
  /** Records that could be read (the header count, unless the file was cut short). */
  recordCount: number;
  fields: DbfField[];
  rows: DbfRecord[];
  /** Records after the ones in `rows`. */
  moreRows: number;
  warnings: DbfWarning[];
};

const pad = (n: number, w: number) => String(n).padStart(w, '0');

/** Reads a .DBF and keeps the first `maxRows` records. Throws DbfError if it is not a .DBF. */
export function inspectDbf(bytes: Uint8Array, maxRows = INSPECT_ROWS): InspectedTable {
  const dbf = readDbf(bytes);
  const { year, month, day } = dbf.header.lastUpdate;
  const rows = dbf.records.slice(0, maxRows);
  return {
    version: dbf.header.version,
    lastUpdate: `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`,
    recordCount: dbf.records.length,
    fields: dbf.fields,
    rows,
    moreRows: dbf.records.length - rows.length,
    warnings: dbf.warnings ?? [],
  };
}
