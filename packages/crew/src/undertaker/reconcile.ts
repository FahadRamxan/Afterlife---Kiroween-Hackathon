// The Undertaker's reconciliation (Prompt 65): control totals of the old data and of the migrated
// data, side by side. Per table, the count of live records and the sum of every numeric field;
// overall, the stock value (quantity times price, for an entity with both) and the outstanding
// balances (fields named BALANCE). Everything in decimals, and every total must match exactly:
// the old side less what was rejected (it did not cross), against what is in the reborn app.
import Decimal from 'decimal.js';
import type { DbfRecord } from '@afterlife/dbf';
import type { Entity, Soul } from '@afterlife/soul';
import type { Rejected } from './migrate';

export type TableTotals = {
  file: string;
  entity: string;
  count: number;
  /** The sum of each numeric field, as a decimal string. */
  sums: Record<string, string>;
};

export type ControlTotals = {
  tables: TableTotals[];
  /** The stock's value: each record's quantity times its price; null when no entity has both. */
  stockValue: string | null;
  /** The outstanding balances, per entity with a BALANCE field. */
  balances: { file: string; total: string }[];
};

export type ReconciliationLine = {
  table: string;
  /** "records", "sum of PRICE", "stock value", "balances". */
  total: string;
  /** The old data, all of it; what was rejected; what crossed. */
  before: string;
  rejected: string;
  after: string;
  ok: boolean;
};

export type Reconciliation = {
  matches: boolean;
  lines: ReconciliationLine[];
  /** The control totals of each side, for the certificate (Prompt 71). */
  old: ControlTotals;
  migrated: ControlTotals;
};

const QTY = /^(QTY|QUANTITY|STOCK)$/i;
const PRICE = /^(PRICE|RATE|COST)$/i;
const BALANCE = /^BALANCE$/i;

const num = (v: unknown): Decimal => {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s) ? new Decimal(s) : new Decimal(0);
};
const live = (rs: DbfRecord[] | undefined) => (rs ?? []).filter((r) => !r.deleted);
const numeric = (e: Entity) => e.fields.filter((f) => f.type === 'N' || f.type === 'F');

/** The stock value of one entity's records (quantity times price), or null without both fields. */
function stockOf(e: Entity, records: DbfRecord[]): Decimal | null {
  const q = numeric(e).find((f) => QTY.test(f.name));
  const p = numeric(e).find((f) => PRICE.test(f.name));
  if (!q || !p) return null;
  // Lines of a bill have both too, but are not stock: the entity others point at is.
  return records.reduce(
    (s, r) => s.plus(num(r.values[q.name]).times(num(r.values[p.name]))),
    new Decimal(0),
  );
}

/** The control totals of a Soul's data files (by DOS name, any case). */
export function controlTotals(soul: Soul, tables: Record<string, DbfRecord[]>): ControlTotals {
  const byName = new Map(Object.entries(tables).map(([f, r]) => [f.toUpperCase(), r]));
  const of = (e: Entity) => live(byName.get(e.file.toUpperCase()));
  const referenced = new Set(
    soul.entities.flatMap((e) => e.foreignKeys.map((fk) => fk.references.entity)),
  );
  let stock: Decimal | null = null;
  for (const e of soul.entities) {
    // Stock is what is pointed at (the medicine a bill line names), not the lines themselves.
    if (!referenced.has(e.id)) continue;
    const v = stockOf(e, of(e));
    if (v) stock = (stock ?? new Decimal(0)).plus(v);
  }
  return {
    tables: soul.entities.map((e) => ({
      file: e.file,
      entity: e.id,
      count: of(e).length,
      sums: Object.fromEntries(
        numeric(e).map((f) => [
          f.name,
          of(e)
            .reduce((s, r) => s.plus(num(r.values[f.name])), new Decimal(0))
            .toString(),
        ]),
      ),
    })),
    stockValue: stock ? stock.toString() : null,
    balances: soul.entities
      .filter((e) => referenced.has(e.id) && numeric(e).some((f) => BALANCE.test(f.name)))
      .map((e) => {
        const f = numeric(e).find((x) => BALANCE.test(x.name))!;
        return {
          file: e.file,
          total: of(e)
            .reduce((s, r) => s.plus(num(r.values[f.name])), new Decimal(0))
            .toString(),
        };
      }),
  };
}

/**
 * The old data's totals against the migrated data's. A rejected record did not cross: the old
 * side less those records must equal the migrated side, exactly.
 */
export function reconcile(
  soul: Soul,
  old: Record<string, DbfRecord[]>,
  migrated: Record<string, DbfRecord[]>,
  rejected: Rejected[],
): Reconciliation {
  const byName = new Map(Object.entries(old).map(([f, r]) => [f.toUpperCase(), r]));
  // The records that were rejected, by file: their place in the data file (from 1).
  const out = new Map<string, Set<number>>();
  for (const r of rejected) {
    const k = r.file.toUpperCase();
    out.set(k, (out.get(k) ?? new Set()).add(r.recno));
  }
  const rejectedOnly: Record<string, DbfRecord[]> = {};
  const crossed: Record<string, DbfRecord[]> = {};
  for (const e of soul.entities) {
    const k = e.file.toUpperCase();
    const rs = byName.get(k) ?? [];
    const gone = out.get(k) ?? new Set<number>();
    rejectedOnly[k] = rs.filter((_, i) => gone.has(i + 1));
    crossed[k] = rs.filter((_, i) => !gone.has(i + 1));
  }
  const a = controlTotals(soul, old);
  const r = controlTotals(soul, rejectedOnly);
  const expected = controlTotals(soul, crossed);
  const m = controlTotals(soul, migrated);
  const lines: ReconciliationLine[] = [];
  const line = (
    table: string,
    total: string,
    before: string,
    rej: string,
    want: string,
    after: string,
  ) =>
    lines.push({
      table,
      total,
      before,
      rejected: rej,
      after,
      ok: new Decimal(want).eq(new Decimal(after)),
    });
  soul.entities.forEach((e, i) => {
    line(
      e.file,
      'records',
      String(a.tables[i]!.count),
      String(r.tables[i]!.count),
      String(expected.tables[i]!.count),
      String(m.tables[i]!.count),
    );
    for (const f of Object.keys(a.tables[i]!.sums))
      line(
        e.file,
        `sum of ${f}`,
        a.tables[i]!.sums[f]!,
        r.tables[i]!.sums[f]!,
        expected.tables[i]!.sums[f]!,
        m.tables[i]!.sums[f]!,
      );
  });
  if (a.stockValue !== null)
    line(
      'all',
      'stock value',
      a.stockValue,
      r.stockValue ?? '0',
      expected.stockValue ?? '0',
      m.stockValue ?? '0',
    );
  a.balances.forEach((b, i) =>
    line(
      b.file,
      'balances',
      b.total,
      r.balances[i]?.total ?? '0',
      expected.balances[i]?.total ?? '0',
      m.balances[i]?.total ?? '0',
    ),
  );
  return { matches: lines.every((l) => l.ok), lines, old: a, migrated: m };
}
