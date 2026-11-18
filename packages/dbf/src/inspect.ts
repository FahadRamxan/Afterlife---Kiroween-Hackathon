import { readDbf } from './reader';
import type { DbfField, DbfRecord, DbfWarning } from './types';

/** How many records the inspector returns per file. */
export const INSPECT_ROWS = 100;

/** A quick look at one .DBF: its schema and the first rows. JSON-safe. */
export type InspectedTable = {
  /** Version byte: 0x03 dBASE III or Clipper, 0x83 with memo, 0xF5 FoxPro 2.x. */
  version: number;
  /** YYYY-MM-DD from the header, or null when the header's date bytes are not a real date. */
  lastUpdate: string | null;
  /** Records that could be read (the header count, unless the file was cut short). */
  recordCount: number;
  fields: DbfField[];
  rows: DbfRecord[];
  /** Records after the ones in `rows`. */
  moreRows: number;
  warnings: DbfWarning[];
};

const pad = (n: number, w: number) => String(n).padStart(w, '0');

/**
 * The header date as YYYY-MM-DD, or null. The reader keeps the raw bytes, and real files can
 * hold anything there (0, or a month of 200 from a tool that never set it).
 */
function headerDate({ year, month, day }: { year: number; month: number; day: number }) {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (month < 1 || month > 12 || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day)
    return null;
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** Reads a .DBF and keeps the first `maxRows` records. Throws DbfError if it is not a .DBF. */
export function inspectDbf(bytes: Uint8Array, maxRows = INSPECT_ROWS): InspectedTable {
  const dbf = readDbf(bytes);
  const rows = dbf.records.slice(0, maxRows);
  return {
    version: dbf.header.version,
    lastUpdate: headerDate(dbf.header.lastUpdate),
    recordCount: dbf.records.length,
    fields: dbf.fields,
    rows,
    moreRows: dbf.records.length - rows.length,
    warnings: dbf.warnings ?? [],
  };
}
