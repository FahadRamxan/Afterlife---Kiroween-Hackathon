// Comparing what a case did in the old app and in the Vessel (Prompt 68). Both sides give their
// effects in the data files' own diff format (SnapshotDiff). They agree when every table had the
// same records inserted, deleted and updated, with the same values: numbers compared as numbers
// (5000.00 is 5000), text without its padding. Record numbers place an update or a deletion;
// inserted records are paired by their key, or in order when the table has none.
import Decimal from 'decimal.js';
import type { DbfValue, RecordRef, SnapshotDiff, TableDiff } from '@afterlife/dbf';

/** One thing the two sides did differently. */
export type Difference = {
  table: string;
  kind: 'inserted' | 'deleted' | 'updated';
  /** The record's key (BILL_NO 0042), or its record number (#12). */
  record: string;
  /** The field that differs; absent when one side has the record and the other has not. */
  field?: string;
  /** The value on each side ('' for blank); null when that side has no such record or change. */
  old: string | null;
  vessel: string | null;
};

const NUMBER = /^-?\d+(\.\d+)?$/;

/** A value as compared: numbers as numbers, text trimmed, blank as ''. */
export function normalValue(v: DbfValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'T' : 'F';
  const s = String(v).trim();
  return NUMBER.test(s) ? new Decimal(s).toString() : s;
}

const EMPTY: TableDiff = {
  key: null,
  inserted: [],
  deleted: [],
  updated: [],
  schema: { added: [], removed: [] },
};

const changed = (t: TableDiff | undefined) =>
  !!t && (t.inserted.length > 0 || t.deleted.length > 0 || t.updated.length > 0);

/** Compares the values of two records, field by field (the fields either side has). */
function recordDifferences(
  table: string,
  kind: Difference['kind'],
  record: string,
  a: Record<string, DbfValue>,
  b: Record<string, DbfValue>,
): Difference[] {
  const out: Difference[] = [];
  for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const [x, y] = [normalValue(a[field]), normalValue(b[field])];
    if (x !== y) out.push({ table, kind, record, field, old: x, vessel: y });
  }
  return out;
}

function tableDifferences(table: string, o: TableDiff, v: TableDiff): Difference[] {
  const out: Difference[] = [];
  // Inserted: paired by the key either side matched by, else in the order they were written.
  const key = o.key ?? v.key;
  const name = (r: RecordRef, i: number) =>
    key && r.values[key] !== undefined ? `${key} ${normalValue(r.values[key])}` : `new #${i + 1}`;
  const vIns = new Map(v.inserted.map((r, i) => [name(r, i), r]));
  o.inserted.forEach((r, i) => {
    const id = name(r, i);
    const w = vIns.get(id);
    vIns.delete(id);
    if (!w) out.push({ table, kind: 'inserted', record: id, old: 'written', vessel: null });
    else out.push(...recordDifferences(table, 'inserted', id, r.values, w.values));
  });
  for (const id of vIns.keys())
    out.push({ table, kind: 'inserted', record: id, old: null, vessel: 'written' });
  // Deleted: by record number.
  const vDel = new Set(v.deleted.map((r) => r.recno));
  const oDel = new Set(o.deleted.map((r) => r.recno));
  for (const n of oDel)
    if (!vDel.has(n))
      out.push({ table, kind: 'deleted', record: `#${n + 1}`, old: 'deleted', vessel: null });
  for (const n of vDel)
    if (!oDel.has(n))
      out.push({ table, kind: 'deleted', record: `#${n + 1}`, old: null, vessel: 'deleted' });
  // Updated: by record number, each changed field's new value (a field one side left alone keeps
  // its old value, so it differs only if the other side changed it to something else).
  const at = (t: TableDiff) => new Map(t.updated.map((u) => [u.beforeRecno, u]));
  const [oUp, vUp] = [at(o), at(v)];
  for (const n of new Set([...oUp.keys(), ...vUp.keys()])) {
    const [a, b] = [oUp.get(n), vUp.get(n)];
    const k = (a ?? b)!.key;
    const id = k !== null && key ? `${key} ${k}` : `#${n + 1}`;
    const before = new Map<string, DbfValue>();
    const after = (u: typeof a) => {
      const m = new Map<string, DbfValue>();
      for (const c of u?.changes ?? []) {
        before.set(c.field, c.before);
        m.set(c.field, c.after);
      }
      return m;
    };
    const [x, y] = [after(a), after(b)];
    for (const field of new Set([...x.keys(), ...y.keys()])) {
      const ov = normalValue(x.has(field) ? x.get(field) : before.get(field));
      const vv = normalValue(y.has(field) ? y.get(field) : before.get(field));
      if (ov !== vv) out.push({ table, kind: 'updated', record: id, field, old: ov, vessel: vv });
    }
  }
  return out;
}

/** Everything the two sides did differently, table by table (empty when they agree). */
export function effectDifferences(old: SnapshotDiff, vessel: SnapshotDiff): Difference[] {
  const tables = [...new Set([...Object.keys(old.tables), ...Object.keys(vessel.tables)])]
    .filter((t) => changed(old.tables[t]) || changed(vessel.tables[t]))
    .sort();
  return tables.flatMap((t) =>
    tableDifferences(t, old.tables[t] ?? EMPTY, vessel.tables[t] ?? EMPTY),
  );
}

/** The two sides did the same to the data files. */
export const sameEffects = (old: SnapshotDiff, vessel: SnapshotDiff) =>
  effectDifferences(old, vessel).length === 0;
