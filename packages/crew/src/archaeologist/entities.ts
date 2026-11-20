// The Archaeologist's first look (Prompt 53): what the data files are, from their schemas, their
// records and the observations of the app using them. Deterministic: no model.
// - keys: fields unique in every record and never changed by the app (or the first pair that is)
// - foreign keys: fields whose every value set is another table's key
// - counters: keys the app numbers itself ("C0009" after "C0008", "9807-0001" in July 1998)
// - derived fields: a field that is always the product or sum of others in its record
import type { DbfFile, DbfValue, SnapshotDiff } from '@afterlife/dbf';
import type { Entity } from '@afterlife/soul';

export type TableInput = { file: string; table: DbfFile };

const live = (t: DbfFile) => t.records.filter((r) => !r.deleted);
const str = (v: DbfValue | undefined) => (v === null || v === undefined ? '' : String(v).trim());

/** Fields the app changed in some observation: no key is ever updated. */
function updatedFields(file: string, observations: SnapshotDiff[]): Set<string> {
  const out = new Set<string>();
  for (const o of observations)
    for (const u of o.tables[file]?.updated ?? []) for (const c of u.changes) out.add(c.field);
  return out;
}

const unique = (rows: string[]) =>
  rows.every((v) => v !== '') && new Set(rows).size === rows.length;

/**
 * The fields that pick one record: the first character field (in file order) that is set and
 * unique in every record and never updated, else the first such pair. Numbers are not keys
 * alone (a stock quantity can be unique by chance), but a line number can be part of a pair.
 */
export function detectKeys(
  t: TableInput,
  observations: SnapshotDiff[],
  /** Fields that refer to another table: unique here by chance, never this table's key alone. */
  refers: Set<string> = new Set(),
): string[] {
  const rows = live(t.table);
  if (rows.length < 2) return [];
  const changed = updatedFields(t.file, observations);
  const fields = t.table.fields.filter(
    (f) => !changed.has(f.name) && f.type !== 'M' && f.type !== 'L',
  );
  const col = (name: string) => rows.map((r) => str(r.values[name]));
  for (const f of fields)
    if (f.type === 'C' && !refers.has(f.name) && unique(col(f.name))) return [f.name];
  for (let i = 0; i < fields.length; i++)
    for (let j = i + 1; j < fields.length; j++) {
      const a = fields[i]!;
      const b = fields[j]!;
      if (a.type !== 'C') continue;
      const pair = rows.map((r) => `${str(r.values[a.name])}\u0000${str(r.values[b.name])}`);
      if (
        col(a.name).every((v) => v !== '') &&
        col(b.name).every((v) => v !== '') &&
        new Set(pair).size === pair.length
      )
        return [a.name, b.name];
    }
  return [];
}

export type FileForeignKey = { fields: string[]; references: { file: string; fields: string[] } };

/**
 * A field refers to another table when that table has a one-field key, the field's type and width
 * match it, every value set is one of its keys, and at least one is set. Blanks are allowed (a
 * walk-in bill has no customer). A table's own key does not refer to itself.
 */
export function detectForeignKeys(
  tables: TableInput[],
  keys: Record<string, string[]>,
  /** Also check a table's own one-field key (to find a key that is really a reference). */
  opts: { includeOwnKey?: boolean } = {},
): Record<string, FileForeignKey[]> {
  const out: Record<string, FileForeignKey[]> = {};
  for (const t of tables) {
    const own = keys[t.file] ?? [];
    for (const f of t.table.fields) {
      if (!opts.includeOwnKey && own.length === 1 && own[0] === f.name) continue;
      const values = live(t.table)
        .map((r) => str(r.values[f.name]))
        .filter((v) => v !== '');
      if (!values.length) continue;
      for (const other of tables) {
        if (other.file === t.file) continue;
        const k = keys[other.file] ?? [];
        if (k.length !== 1) continue;
        const kf = other.table.fields.find((x) => x.name === k[0])!;
        if (kf.type !== f.type || kf.length !== f.length) continue;
        const known = new Set(live(other.table).map((r) => str(r.values[kf.name])));
        if (values.every((v) => known.has(v))) {
          (out[t.file] ??= []).push({
            fields: [f.name],
            references: { file: other.file, fields: [kf.name] },
          });
          break;
        }
      }
    }
  }
  return out;
}

/**
 * The shape of a run of ids: letters and punctuation stay, digits become #. Two leading digit pairs
 * that are the year and month of the record's date are YYMM. Null when the ids do not share one
 * shape with digits in it (codes like PAN500 and BRU400 are not numbered by the app).
 */
export function counterPattern(ids: string[], dates?: string[]): string | null {
  if (ids.length < 2) return null;
  const shapes = new Set(ids.map((id) => id.replace(/\d/g, '#')));
  if (shapes.size !== 1) return null;
  const shape = [...shapes][0]!;
  const run = /#+$/.exec(shape);
  if (!run || run[0].length < 3) return null;
  // The part before the number must be the same for all, or a date.
  const prefixes = ids.map((id) => id.slice(0, id.length - run[0].length));
  if (new Set(prefixes).size === 1) return shape;
  if (
    dates &&
    shape.startsWith('####') &&
    ids.every((id, i) => (dates[i] ?? '').length === 8 && id.slice(0, 4) === dates[i]!.slice(2, 6))
  )
    return `YYMM${shape.slice(4)}`;
  return null;
}

/** The next id of a counter: one more than the highest (of this month, for YYMM ones). */
export function nextCounter(
  pattern: string,
  ids: string[],
  now?: { year: number; month: number },
): string | null {
  const width = /#+$/.exec(pattern)?.[0].length ?? 0;
  if (!width) return null;
  let prefix = pattern.slice(0, pattern.length - width);
  if (prefix.startsWith('YYMM')) {
    if (!now) return null;
    prefix = `${String(now.year % 100).padStart(2, '0')}${String(now.month).padStart(2, '0')}${prefix.slice(4)}`;
  }
  const nums = ids
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number(id.slice(prefix.length)));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  const out = `${prefix}${String(next).padStart(width, '0')}`;
  return out.length === pattern.length ? out : null;
}

const dateField = (t: DbfFile) => t.fields.find((f) => f.type === 'D')?.name;

/**
 * The key fields the app numbers itself. The shape comes from the records; it counts as a counter
 * only when every record the observations inserted got the next number, from the table as it was
 * before (a code typed by the user would not).
 */
export function detectCounters(
  t: TableInput,
  key: string[],
  observations: SnapshotDiff[],
): { field: string; pattern: string }[] {
  if (key.length !== 1) return [];
  const field = key[0]!;
  const rows = live(t.table);
  const dateF = dateField(t.table);
  const ids = rows.map((r) => str(r.values[field]));
  const inserts = observations.flatMap((o) => o.tables[t.file]?.inserted ?? []);
  if (!inserts.length) return [];
  const allIds = [...ids, ...inserts.map((r) => str(r.values[field]))];
  const allDates = dateF
    ? [...rows.map((r) => str(r.values[dateF])), ...inserts.map((r) => str(r.values[dateF]))]
    : undefined;
  const pattern = counterPattern(allIds, allDates);
  if (!pattern) return [];
  const seen = [...ids];
  for (const r of inserts) {
    const id = str(r.values[field]);
    const d = dateF ? str(r.values[dateF]) : '';
    const now =
      d.length === 8 ? { year: Number(d.slice(0, 4)), month: Number(d.slice(4, 6)) } : undefined;
    if (nextCounter(pattern, seen, now) !== id) return [];
    seen.push(id);
  }
  return [{ field, pattern }];
}

/** The counter pattern of a plain number the app gives out: one more than the highest. */
export const NUMBER_COUNTER = 'n+1';

/**
 * A whole-number field the app numbers itself (Iqra's RECEIPT, Barkat's ENTRY): unique in every
 * record, never updated, and every record the observations inserted got one more than the highest
 * before it. Null when there is none, or nothing was inserted to show it.
 */
export function numberCounter(t: TableInput, observations: SnapshotDiff[]): string | null {
  const inserts = observations.flatMap((o) => o.tables[t.file]?.inserted ?? []);
  if (!inserts.length) return null;
  const changed = updatedFields(t.file, observations);
  const rows = live(t.table);
  for (const f of t.table.fields) {
    if ((f.type !== 'N' && f.type !== 'F') || f.decimals !== 0 || changed.has(f.name)) continue;
    const vals = rows.map((r) => str(r.values[f.name]));
    if (!vals.every((v) => /^\d+$/.test(v)) || new Set(vals).size !== vals.length) continue;
    let high = Math.max(0, ...vals.map(Number));
    const ok = inserts.every((r) => {
      const v = str(r.values[f.name]);
      if (!/^\d+$/.test(v) || Number(v) !== high + 1) return false;
      high += 1;
      return true;
    });
    if (ok) return f.name;
  }
  return null;
}

export type Derived = { field: string; expression: string };

const num = (v: DbfValue | undefined) => {
  const s = str(v);
  return /^-?\d+(\.\d+)?$/.test(s) ? Math.round(Number(s) * 100) : null;
};

/**
 * Number fields that are always the product of two others (AMOUNT = QTY * PRICE), or a sum and
 * difference of others (TOTAL = SUBTOTAL - DISCOUNT + GST), in every record. Checked in paisa.
 */
export function detectDerived(t: TableInput): Derived[] {
  const rows = live(t.table);
  if (rows.length < 2) return [];
  const nums = t.table.fields.filter((f) => f.type === 'N' || f.type === 'F').map((f) => f.name);
  const v = rows.map((r) => Object.fromEntries(nums.map((n) => [n, num(r.values[n])])));
  const all = (fn: (x: Record<string, number | null>) => boolean) => v.every((x) => fn(x));
  const out: Derived[] = [];
  const lc = (s: string) => s.toLowerCase();
  for (const target of nums) {
    const others = nums.filter((n) => n !== target);
    let found: string | null = null;
    // A product of two (the paisa of a product need one more division by 100).
    for (let i = 0; i < others.length && !found; i++)
      for (let j = i + 1; j < others.length && !found; j++) {
        const a = others[i]!;
        const b = others[j]!;
        if (
          all(
            (x) =>
              x[target] !== null &&
              x[a] !== null &&
              x[b] !== null &&
              x[target]! * 100 === x[a]! * x[b]!,
          )
        )
          found = `${lc(a)} * ${lc(b)}`;
      }
    // A sum and difference of two or three, signs in field order.
    const signs = [1, -1];
    for (let k = 2; k <= 3 && !found; k++) {
      const combos = (start: number, left: number): string[][] =>
        left === 0
          ? [[]]
          : others
              .slice(start)
              .flatMap((n, i) => combos(start + i + 1, left - 1).map((c) => [n, ...c]));
      for (const fields of combos(0, k)) {
        const signSets = fields
          .slice(1)
          .reduce<number[][]>((acc) => acc.flatMap((s) => signs.map((g) => [...s, g])), [[]]);
        for (const s of signSets) {
          const sign = [1, ...s];
          const ok = all(
            (x) =>
              fields.every((f) => x[f] !== null) &&
              x[target] !== null &&
              fields.reduce((n, f, i) => n + sign[i]! * x[f]!, 0) === x[target],
          );
          // A field that is zero in every record says nothing: it fits any sum.
          const used = fields.every((f) => v.some((x) => x[f] !== 0));
          if (ok && used) {
            found = fields
              .map((f, i) => `${i ? (sign[i]! > 0 ? ' + ' : ' - ') : ''}${lc(f)}`)
              .join('');
            break;
          }
        }
        if (found) break;
      }
    }
    if (found) out.push({ field: target, expression: found });
  }
  return out;
}

/** An entity id and name from a file name: BILLITEM.DBF is bill-item, "Bill line". */
const NAMES: Record<string, [string, string]> = {
  MEDICINE: ['medicine', 'Medicine'],
  CUSTOMER: ['customer', 'Customer'],
  BILLS: ['bill', 'Bill'],
  BILLITEM: ['bill-item', 'Bill line'],
};
function naming(file: string): [string, string] {
  const base = file.replace(/\.DBF$/i, '').toUpperCase();
  if (NAMES[base]) return NAMES[base];
  let s = base.toLowerCase();
  // Plurals and run-together words of 8.3 names: BILLS, PAYMENTS; BILLITEM, STUDFEE.
  if (s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  const id = s.replace(/(item|line|fee|pay)$/, '-$1').replace(/^-/, '');
  const name = id
    .split('-')
    .map((w, i) => (i ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(' ');
  return [id, name];
}

/** The Soul's entities: one per data file, with its keys, foreign keys and counters. */
export async function detectEntities(
  tables: TableInput[],
  observations: SnapshotDiff[],
): Promise<Entity[]> {
  // Two passes: keys, then the fields that refer to another table's key, which cannot be a key
  // of their own table alone (a bill line's medicine code is unique in a small sample by chance).
  const first = Object.fromEntries(tables.map((t) => [t.file, detectKeys(t, observations)]));
  const refers = detectForeignKeys(tables, first, { includeOwnKey: true });
  // A number the app gives out (receipt 1, 2, 3) is the record's identity: it is the key.
  const numbered = Object.fromEntries(tables.map((t) => [t.file, numberCounter(t, observations)]));
  const keys = Object.fromEntries(
    tables.map((t) => [
      t.file,
      numbered[t.file]
        ? [numbered[t.file]!]
        : detectKeys(t, observations, new Set((refers[t.file] ?? []).flatMap((f) => f.fields))),
    ]),
  );
  const fks = detectForeignKeys(tables, keys);
  const ids = Object.fromEntries(tables.map((t) => [t.file, naming(t.file)[0]]));
  return tables.map((t) => {
    const [id, name] = naming(t.file);
    return {
      id,
      name,
      file: t.file.toUpperCase(),
      fields: t.table.fields.map((f) => ({
        name: f.name,
        type: f.type,
        length: f.length,
        decimals: f.decimals,
      })),
      key: keys[t.file]!,
      foreignKeys: (fks[t.file] ?? []).map((fk) => ({
        fields: fk.fields,
        references: { entity: ids[fk.references.file]!, fields: fk.references.fields },
      })),
      counters: numbered[t.file]
        ? [{ field: numbered[t.file]!, pattern: NUMBER_COUNTER }]
        : detectCounters(t, keys[t.file]!, observations),
    } as Entity;
  });
}
