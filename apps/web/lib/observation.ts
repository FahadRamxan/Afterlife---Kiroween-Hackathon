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

/**
 * What a finished "replay N times" says. Only when every run finished can it call them identical:
 * if one failed, the runs that did finish prove nothing. Nor do runs that left the data as it was
 * before (`before`): if every key were lost, the "same result" would be the starting data.
 */
export function replayVerdict(
  hashes: string[],
  total: number,
  before?: string,
): { ok: boolean; text: string } {
  if (hashes.length < total)
    return { ok: false, text: `Only ${hashes.length} of ${total} runs finished.` };
  if (!hashes.every((h) => h === hashes[0]))
    return { ok: false, text: 'The runs gave different data files: not repeatable.' };
  if (before !== undefined && hashes[0] === before)
    return { ok: false, text: 'The keys changed no data, so the runs prove nothing.' };
  return { ok: true, text: `${total} of ${total} runs gave identical data files.` };
}

const records = (n: number) => `${n} record${n === 1 ? '' : 's'}`;

/** The tables whose record count differs, in name order: "BILLS.DBF: 3 → 4 records". */
export function recordCountChanges(
  before: Record<string, number>,
  after: Record<string, number>,
): string[] {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return names.flatMap((n) => {
    const a = before[n];
    const b = after[n];
    if (a === b) return [];
    if (a === undefined) return [`${n}: new, ${records(b!)}`];
    if (b === undefined) return [`${n}: gone (was ${records(a)})`];
    return [`${n}: ${a} → ${records(b)}`];
  });
}

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
