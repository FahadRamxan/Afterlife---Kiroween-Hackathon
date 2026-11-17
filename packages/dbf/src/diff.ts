import Decimal from 'decimal.js';
import { readDbf } from './reader';
import type { DbfField, DbfFile, DbfRecord, DbfValue } from './types';

/** The part of a table a diff needs. */
export type Table = Pick<DbfFile, 'fields' | 'records'>;

export type FieldChange = {
  field: string;
  before: DbfValue;
  after: DbfValue;
  /** after - before for numeric fields, exact, with the field's decimals. Absent for other types. */
  delta?: string | null;
};

export type RecordRef = { key: string | null; recno: number; values: Record<string, DbfValue> };

export type RecordUpdate = {
  key: string | null;
  beforeRecno: number;
  afterRecno: number;
  changes: FieldChange[];
};

export type TableDiff = {
  /** The field records were matched by, or null for record numbers. */
  key: string | null;
  inserted: RecordRef[];
  deleted: RecordRef[];
  updated: RecordUpdate[];
  /** Fields that exist on only one side. Only the common fields are compared. */
  schema: { added: string[]; removed: string[] };
};

const KEY_NAME = /(ID|CODE|NO|ENTRY|RECEIPT)$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

/** after - before, exact, or null when either side is blank or dBASE's ******** overflow marker. */
export function numericDelta(before: DbfValue, after: DbfValue, decimals: number): string | null {
  if (typeof before !== 'string' || typeof after !== 'string') return null;
  if (!DECIMAL.test(before) || !DECIMAL.test(after)) return null;
  return new Decimal(after).minus(before).toFixed(decimals);
}

const keyText = (v: DbfValue) => (v === null ? '' : String(v));

/**
 * The key field: a C or N field named like a key (…ID, …CODE, …NO, …ENTRY, …RECEIPT) whose values
 * are never blank and unique among the live records of every snapshot. Null if none: then records
 * are matched by record number. A field that is merely unique by chance (QTY) is never chosen.
 */
export function detectKey(fields: DbfField[], snapshots: DbfRecord[][]): string | null {
  for (const f of fields) {
    if ((f.type !== 'C' && f.type !== 'N') || !KEY_NAME.test(f.name)) continue;
    const ok = snapshots.every((records) => {
      const seen = new Set<string>();
      for (const r of records) {
        if (r.deleted) continue;
        const k = keyText(r.values[f.name] ?? null);
        if (k === '' || seen.has(k)) return false;
        seen.add(k);
      }
      return true;
    });
    if (ok) return f.name;
  }
  return null;
}

type Entry = { id: string; key: string | null; recno: number; values: Record<string, DbfValue> };

function liveEntries(t: Table, key: string | null): Entry[] {
  const out: Entry[] = [];
  t.records.forEach((r, recno) => {
    if (r.deleted) return;
    const k = key ? keyText(r.values[key] ?? null) : null;
    out.push({ id: k ?? `#${recno}`, key: k, recno, values: r.values });
  });
  return out;
}

/** Compares two versions of one table. */
export function diffTables(
  before: Table,
  after: Table,
  opts: { key?: string | null } = {},
): TableDiff {
  const afterNames = new Set(after.fields.map((f) => f.name));
  const beforeNames = new Set(before.fields.map((f) => f.name));
  const common = before.fields.filter((f) => afterNames.has(f.name));
  const key =
    opts.key !== undefined ? opts.key : detectKey(common, [before.records, after.records]);

  const b = new Map(liveEntries(before, key).map((e) => [e.id, e]));
  const a = new Map(liveEntries(after, key).map((e) => [e.id, e]));

  const inserted: RecordRef[] = [];
  const deleted: RecordRef[] = [];
  const updated: RecordUpdate[] = [];
  for (const e of b.values())
    if (!a.has(e.id)) deleted.push({ key: e.key, recno: e.recno, values: e.values });
  for (const e of a.values()) {
    const old = b.get(e.id);
    if (!old) {
      inserted.push({ key: e.key, recno: e.recno, values: e.values });
      continue;
    }
    const changes: FieldChange[] = [];
    for (const f of common) {
      const x = old.values[f.name] ?? null;
      const y = e.values[f.name] ?? null;
      if (x === y) continue;
      const change: FieldChange = { field: f.name, before: x, after: y };
      if (f.type === 'N' || f.type === 'F') change.delta = numericDelta(x, y, f.decimals);
      changes.push(change);
    }
    if (changes.length)
      updated.push({ key: e.key, beforeRecno: old.recno, afterRecno: e.recno, changes });
  }
  return {
    key,
    inserted,
    deleted,
    updated,
    schema: {
      added: after.fields.filter((f) => !beforeNames.has(f.name)).map((f) => f.name),
      removed: before.fields.filter((f) => !afterNames.has(f.name)).map((f) => f.name),
    },
  };
}

/** Live records as id -> values: the key value, or "#<recno>" when matching by record number. */
export type LiveView = Record<string, Record<string, DbfValue>>;

export function liveView(t: Table, key: string | null): LiveView {
  return Object.fromEntries(liveEntries(t, key).map((e) => [e.id, e.values]));
}

/** Applies a diff to the live view of the "before" table. Gives the live view of "after". */
export function applyDiff(view: LiveView, d: TableDiff): LiveView {
  const id = (key: string | null, recno: number) => key ?? `#${recno}`;
  const out: LiveView = { ...view };
  const moved: [string, Record<string, DbfValue>][] = [];
  for (const r of d.deleted) delete out[id(r.key, r.recno)];
  for (const u of d.updated) {
    const from = id(u.key, u.beforeRecno);
    const values = { ...out[from] };
    for (const c of u.changes) values[c.field] = c.after;
    delete out[from];
    moved.push([id(u.key, u.afterRecno), values]);
  }
  for (const [k, v] of moved) out[k] = v;
  for (const r of d.inserted) out[id(r.key, r.recno)] = r.values;
  return out;
}

export type TableSnapshot = { hash: string; table: DbfFile };
/** Every .DBF in a folder: its SHA-256 and its parsed contents, by upper-case file name. */
export type Snapshot = { tables: Record<string, TableSnapshot> };

export type SnapshotDiff = {
  tables: Record<string, TableDiff>;
  /** Files whose bytes did not change. */
  unchanged: string[];
  addedTables: string[];
  removedTables: string[];
};

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Snapshots the .DBF files among `files` (name -> bytes). Pure: works in the browser too. */
export async function snapshot(files: Record<string, Uint8Array>): Promise<Snapshot> {
  const tables: Record<string, TableSnapshot> = {};
  for (const [name, bytes] of Object.entries(files).sort(([x], [y]) => x.localeCompare(y))) {
    const upper = name.toUpperCase();
    if (!upper.endsWith('.DBF')) continue;
    let table: DbfFile;
    try {
      table = readDbf(bytes);
    } catch (e) {
      throw new Error(`${upper}: ${(e as Error).message}`, { cause: e });
    }
    tables[upper] = { hash: await sha256(bytes), table };
  }
  return { tables };
}

export function diffSnapshots(before: Snapshot, after: Snapshot): SnapshotDiff {
  const out: SnapshotDiff = { tables: {}, unchanged: [], addedTables: [], removedTables: [] };
  for (const name of Object.keys(before.tables))
    if (!after.tables[name]) out.removedTables.push(name);
  for (const [name, now] of Object.entries(after.tables)) {
    const was = before.tables[name];
    if (!was) out.addedTables.push(name);
    else if (was.hash === now.hash) out.unchanged.push(name);
    else out.tables[name] = diffTables(was.table, now.table);
  }
  return out;
}

export function isEmptyDiff(d: SnapshotDiff): boolean {
  return (
    d.addedTables.length === 0 &&
    d.removedTables.length === 0 &&
    Object.values(d.tables).every(
      (t) => !t.inserted.length && !t.deleted.length && !t.updated.length,
    )
  );
}
