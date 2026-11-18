import type { Observation } from '@afterlife/emulator';

export type TableSummary = {
  name: string;
  inserted: number;
  deleted: number;
  changed: number;
  /** One line per record: "+ 9807-0001", "- record 5", "PAN500 QTY 240 → 236 (-4)". */
  lines: string[];
};

export type ObservationSummary = {
  keys: string;
  from: string;
  to: string;
  durationMs: number;
  stable: boolean;
  tables: TableSummary[];
  unchanged: string[];
};

const show = (v: unknown) => (v === null || v === '' ? '(blank)' : String(v));

/** An observation in words, for the live emulator panel. Tables in name order. */
export function summarizeObservation(o: Observation): ObservationSummary {
  const id = (key: string | null, recno: number) => key ?? `record ${recno + 1}`;
  const tables = Object.entries(o.dbfDiff.tables)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, t]) => ({
      name,
      inserted: t.inserted.length,
      deleted: t.deleted.length,
      changed: t.updated.length,
      lines: [
        ...t.inserted.map((r) => `+ ${id(r.key, r.recno)}`),
        ...t.deleted.map((r) => `- ${id(r.key, r.recno)}`),
        ...t.updated.flatMap((u) =>
          u.changes.map(
            (c) =>
              `${id(u.key, u.afterRecno)} ${c.field} ${show(c.before)} → ${show(c.after)}${c.delta ? ` (${c.delta})` : ''}`,
          ),
        ),
      ],
    }));
  return {
    keys: o.keys,
    from: o.screenBefore.model.title?.name ?? 'unknown',
    to: o.screenAfter.model.title?.name ?? 'unknown',
    durationMs: o.durationMs,
    stable: o.stable,
    tables,
    unchanged: o.dbfDiff.unchanged,
  };
}
