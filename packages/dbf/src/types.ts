/** dBASE III / FoxPro 2.x field types. M is a memo: only the block number is in the .DBF. */
export type FieldType = 'C' | 'N' | 'F' | 'D' | 'L' | 'M';

export type DbfField = { name: string; type: FieldType; length: number; decimals: number };

/**
 * One field's value:
 * - C: the text, trailing spaces trimmed ('' when blank)
 * - N, F: exact decimal text ("45.50", "-42"), or dBASE's "********" overflow marker; null when blank.
 *   Never a JS number, so money stays exact.
 * - D: "YYYYMMDD", or null when blank
 * - L: true, false, or null when blank or "?"
 * - M: the memo block number, or null
 */
export type DbfValue = string | boolean | number | null;

export type DbfRecord = { deleted: boolean; values: Record<string, DbfValue> };

export type DbfDate = { year: number; month: number; day: number };

export type DbfHeader = {
  /** 0x03 dBASE III (and Clipper), 0x83 dBASE III with memo, 0xF5 FoxPro 2.x with memo. */
  version: number;
  lastUpdate: DbfDate;
  recordCount: number;
  headerLength: number;
  recordLength: number;
  /** Language driver byte (offset 29): 0 unset, 1 CP437, 2 CP850, 3 Windows-1252. */
  codePage: number;
  hasMemo: boolean;
};

/** Something odd about a file that could still be read. */
export type DbfWarning = { code: 'TRUNCATED'; message: string };

export type DbfFile = {
  header: DbfHeader;
  fields: DbfField[];
  records: DbfRecord[];
  /** Only present when there is something to warn about. */
  warnings?: DbfWarning[];
};

/** What writeDbf takes. version defaults to 0x03, lastUpdate to 1 Jan 1980, codePage to 0. */
export type DbfTable = {
  fields: DbfField[];
  records: DbfRecord[];
  lastUpdate?: DbfDate;
  version?: number;
  codePage?: number;
};

export type DbfErrorCode =
  'TOO_SHORT' | 'BAD_VERSION' | 'BAD_HEADER' | 'BAD_FIELD' | 'TRUNCATED' | 'BAD_VALUE' | 'WIDTH';

/** A .DBF that cannot be read, or a table that cannot be written. `code` says why. */
export class DbfError extends Error {
  override name = 'DbfError';
  constructor(
    readonly code: DbfErrorCode,
    message: string,
  ) {
    super(message);
  }
}
