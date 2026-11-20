// The Vessel's entity stores (Prompt 58). Records are kept the way a .DBF keeps them: in record
// order, values by field name, numbers as exact decimal text, dates as YYYYMMDD, and a deleted
// record keeps its record number. So the Vessel's effects are diffs in the DBF differ's own
// format, and old and new can be compared directly.
import type { DbfRecord, SnapshotDiff, TableDiff } from '@afterlife/dbf';

export interface EntityStore {
  /** Every record of a data file ("BILLS.DBF") by record number, deleted ones too. */
  records(file: string): Promise<DbfRecord[]>;
  /** Replaces a file's records: a seed, or the Undertaker's migration. */
  load(file: string, records: DbfRecord[]): Promise<void>;
  /**
   * Applies an action's effects, all or nothing. A ConflictError, and no change, when the records
   * changed since they were read (an update's "before" is not what is stored now).
   */
  commit(effects: SnapshotDiff): Promise<void>;
}

/** The records changed since an action read them: read again and redo the action. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

const copy = (r: DbfRecord): DbfRecord => ({ deleted: r.deleted, values: { ...r.values } });

/**
 * A file's records after a diff. Checked as it goes, on a copy, so a diff that does not fit the
 * records throws and the records are left as they were.
 */
export function applyTableDiff(file: string, records: DbfRecord[], d: TableDiff): DbfRecord[] {
  const out = records.map(copy);
  const live = (recno: number, what: string) => {
    const r = out[recno];
    if (!r || r.deleted)
      throw new ConflictError(`${file}: record ${recno} to ${what} is not there`);
    return r;
  };
  const keyMatches = (r: DbfRecord, key: string | null) =>
    key === null || d.key === null || String(r.values[d.key] ?? '') === key;
  for (const x of d.deleted) {
    const r = live(x.recno, 'delete');
    if (!keyMatches(r, x.key)) throw new ConflictError(`${file}: record ${x.recno} changed`);
    r.deleted = true;
  }
  for (const u of d.updated) {
    if (u.beforeRecno !== u.afterRecno)
      throw new ConflictError(`${file}: a record cannot move from ${u.beforeRecno}`);
    const r = live(u.beforeRecno, 'update');
    if (!keyMatches(r, u.key)) throw new ConflictError(`${file}: record ${u.beforeRecno} changed`);
    for (const c of u.changes) {
      if ((r.values[c.field] ?? null) !== c.before)
        throw new ConflictError(
          `${file}: ${c.field} of record ${u.beforeRecno} is ${String(r.values[c.field] ?? null)}, not ${String(c.before)}`,
        );
      r.values[c.field] = c.after;
    }
  }
  for (const x of [...d.inserted].sort((a, b) => a.recno - b.recno)) {
    if (x.recno !== out.length)
      throw new ConflictError(`${file}: record ${x.recno} was added by someone else`);
    out.push({ deleted: false, values: { ...x.values } });
  }
  return out;
}

/** Every file's records after the effects, or a ConflictError. */
export function applyEffects(
  current: Record<string, DbfRecord[]>,
  effects: SnapshotDiff,
): Record<string, DbfRecord[]> {
  const out: Record<string, DbfRecord[]> = {};
  for (const [file, d] of Object.entries(effects.tables))
    out[file] = applyTableDiff(file, current[file] ?? [], d);
  return out;
}

/** In memory: tests, the Oracle's runs, and the page before IndexedDB is open. */
export class MemoryEntityStore implements EntityStore {
  private readonly files = new Map<string, DbfRecord[]>();

  async records(file: string) {
    return (this.files.get(file.toUpperCase()) ?? []).map(copy);
  }

  async load(file: string, records: DbfRecord[]) {
    this.files.set(file.toUpperCase(), records.map(copy));
  }

  async commit(effects: SnapshotDiff) {
    const current = Object.fromEntries(
      Object.keys(effects.tables).map((f) => [f, this.files.get(f.toUpperCase()) ?? []]),
    );
    // All files are checked before any is changed.
    for (const [file, records] of Object.entries(applyEffects(current, effects)))
      this.files.set(file.toUpperCase(), records);
  }
}
