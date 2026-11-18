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

export type InspectOptions = {
  /**
   * The bytes were cut on purpose to the header and this many records (dbfPreviewBytes). The
   * header's record count is then the real total, and the cut is not a TRUNCATED file. A file
   * that holds fewer records than the cut should have is still reported.
   */
  cut?: number;
};

/** Reads a .DBF and keeps the first `maxRows` records. Throws DbfError if it is not a .DBF. */
export function inspectDbf(
  bytes: Uint8Array,
  maxRows = INSPECT_ROWS,
  { cut }: InspectOptions = {},
): InspectedTable {
  const dbf = readDbf(bytes);
  const total = dbf.header.recordCount;
  const deliberate =
    cut !== undefined && total > dbf.records.length && dbf.records.length >= Math.min(total, cut);
  const recordCount = deliberate ? total : dbf.records.length;
  const rows = dbf.records.slice(0, maxRows);
  return {
    version: dbf.header.version,
    lastUpdate: headerDate(dbf.header.lastUpdate),
    recordCount,
    fields: dbf.fields,
    rows,
    moreRows: recordCount - rows.length,
    warnings: (dbf.warnings ?? []).filter((w) => !(deliberate && w.code === 'TRUNCATED')),
  };
}

/** Most bytes sent for a file whose header cannot be read: enough for the API to say why. */
const UNREADABLE_PREFIX = 64 * 1024;

/**
 * The header and the first `rows` records of a .DBF, for a preview: a few years of bill lines
 * are megabytes, and a preview shows 100 of them. The header keeps the real record count. A file
 * whose header makes no sense is cut to 64 KB and left for the reader to report.
 */
export function dbfPreviewBytes(bytes: Uint8Array, rows = INSPECT_ROWS): Uint8Array {
  if (bytes.length < 12) return bytes.slice(0, UNREADABLE_PREFIX);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = view.getUint16(8, true);
  const recordLength = view.getUint16(10, true);
  // The field list ends with 0x0D on a 32-byte boundary, as the reader expects.
  let terminated = false;
  for (let p = 32; p < Math.min(headerLength, bytes.length); p += 32)
    if (bytes[p] === 0x0d) {
      terminated = true;
      break;
    }
  if (headerLength < 33 || recordLength < 1 || headerLength > bytes.length || !terminated)
    return bytes.slice(0, UNREADABLE_PREFIX);
  return bytes.slice(0, Math.min(bytes.length, headerLength + rows * recordLength));
}
