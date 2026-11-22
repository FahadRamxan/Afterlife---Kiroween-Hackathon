// The receipt layout of a save (Prompt 61), from the screen the old app was on when the record
// was saved: the bill as the customer saw it. Shifa's NEW BILL screen, before F2, shows the lines
// in a table (# CODE NAME BATCH PRICE QTY AMOUNT) and the totals under it (SUBTOTAL, DISCOUNT
// 10%, GST 17%, TOTAL). Each column and label is matched to the field whose stored values it
// shows: the line's own field, or that of the record the line points at (the medicine's name).
// Deterministic: no model. What matches nothing is left out.
import type { DbfValue } from '@afterlife/dbf';
import type { ScreenModel } from '@afterlife/screen';
import type { Entity, ReceiptLayout } from '@afterlife/soul';
import { labelScore, sameValue, type Shape } from './actions';

type Item = ReceiptLayout['header'][number];
type Tables = Record<string, { values: Record<string, DbfValue> }[]>;
type Candidate = { ref: string; score: number; own: boolean };

const str = (v: DbfValue | undefined) => (v === null || v === undefined ? '' : String(v).trim());
const isNumber = (s: string) => /^-?\d+(\.\d+)?$/.test(s.trim());

/** The records a record points at, by the entity id, from the app's own data. */
function linked(
  of: Entity,
  values: Record<string, DbfValue>,
  entities: Entity[],
  tables: Tables | undefined,
  except?: string,
): { entity: Entity; values: Record<string, DbfValue> }[] {
  const out: { entity: Entity; values: Record<string, DbfValue> }[] = [];
  for (const fk of of.foreignKeys) {
    if (fk.references.entity === except || fk.fields.length !== 1) continue;
    const e = entities.find((x) => x.id === fk.references.entity);
    const ref = str(values[fk.fields[0]!]);
    if (!e || !ref) continue;
    const rec = tables?.[e.file.toUpperCase()]?.find(
      (r) => str(r.values[fk.references.fields[0]!]) === ref,
    );
    if (rec) out.push({ entity: e, values: rec.values });
  }
  return out;
}

/** The one best candidate: the only one, or the one its label names best (then its own field). */
function best(candidates: Candidate[]): string | null {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0]!.ref;
  const sorted = [...candidates].sort((a, b) => b.score - a.score || Number(b.own) - Number(a.own));
  const [a, b] = sorted as [Candidate, Candidate];
  if (a.score > b.score) return a.ref;
  // The same score: the line's own field over one it points at (PRICE on the line, not the
  // medicine's), but never a guess between two fields of one record.
  if (a.score === b.score && a.own !== b.own) return a.ref;
  return null;
}

/**
 * The receipt layout a save's screen shows, or null when it shows neither a table of the lines
 * nor a total. The header starts with the saved record's key and date fields (the number and day
 * the old app gave it), then each "Label: value" of the record and, on the same row, the record
 * it points at (the customer's name).
 */
export function inferReceipt(
  model: ScreenModel,
  shape: Shape,
  entities: Entity[],
  tables?: Tables,
): ReceiptLayout | null {
  const used = new Set<string>();
  const take = (ref: string | null) => {
    if (!ref || used.has(ref)) return null;
    used.add(ref);
    return ref;
  };
  const h = shape.header;
  const headLinks = linked(h, shape.record, entities, tables);

  // The lines: the table with as many rows as the save wrote lines.
  const columns: Item[] = [];
  const table = shape.lines
    ? model.tables.find((t) => t.rows.length === shape.lineRecords.length && t.rows.length > 0)
    : undefined;
  if (table && shape.lines) {
    const L = shape.lines;
    const parent = new Set(
      L.foreignKeys.filter((fk) => fk.references.entity === h.id).flatMap((fk) => fk.fields),
    );
    const lineLinks = shape.lineRecords.map((r) => linked(L, r, entities, tables, h.id));
    table.columns.forEach((col, k) => {
      const cells = table.rows.map((r) => r.cells[k] ?? '');
      if (cells.every((c) => !c.trim())) return;
      if (cells.every((c, i) => c.trim() === String(i + 1))) {
        if (take('#')) columns.push({ label: col.name, ref: '#' });
        return;
      }
      const all = (get: (i: number) => DbfValue | undefined) =>
        cells.every((c, i) => sameValue(c, get(i)));
      const candidates: Candidate[] = [
        ...L.fields
          .filter((f) => !parent.has(f.name) && all((i) => shape.lineRecords[i]![f.name]))
          .map((f) => ({
            ref: `${L.id}.${f.name}`,
            score: labelScore(col.name, f.name),
            own: true,
          })),
        ...(lineLinks[0] ?? []).flatMap((l) =>
          l.entity.fields
            .filter((f) =>
              all((i) => lineLinks[i]?.find((x) => x.entity.id === l.entity.id)?.values[f.name]),
            )
            .map((f) => ({
              ref: `${l.entity.id}.${f.name}`,
              score: labelScore(col.name, f.name),
              own: false,
            })),
        ),
      ].filter((c) => !used.has(c.ref));
      const ref = take(best(candidates));
      if (ref) columns.push({ label: col.name, ref });
    });
  }

  // The totals: a label and a number on one row, outside the table, matched to the saved
  // record's numbers.
  const totals: Item[] = [];
  const tableRows = new Set(table ? [table.headerRow, ...table.rows.map((r) => r.row)] : []);
  const byRow = new Map<number, typeof model.texts>();
  const add = (t: (typeof model.texts)[number]) => {
    if (!tableRows.has(t.row)) byRow.set(t.row, [...(byRow.get(t.row) ?? []), t]);
  };
  for (const t of model.texts) add(t);
  // A highlighted line near the bottom is read as a message ("TOTAL      102.37"): its label and
  // its number are a total too.
  for (const m of model.messages) {
    const x = m.kind === 'info' ? /^(.*?\S)\s{2,}(-?\d+(?:\.\d+)?)$/.exec(m.text.trim()) : null;
    if (!x) continue;
    add({ text: x[1]!, row: m.row, col: m.col, highlight: true });
    add({ text: x[2]!, row: m.row, col: m.col + m.text.indexOf(x[2]!), highlight: true });
  }
  for (const row of [...byRow.keys()].sort((a, b) => a - b)) {
    const texts = [...byRow.get(row)!].sort((a, b) => a.col - b.col);
    const value = texts.find((t) => isNumber(t.text));
    const label = texts.find((t) => t.col < (value?.col ?? 0) && !isNumber(t.text));
    if (!value || !label) continue;
    const candidates: Candidate[] = h.fields
      .filter((f) => f.type === 'N' && sameValue(value.text, shape.record[f.name]))
      .map((f) => ({ ref: `${h.id}.${f.name}`, score: labelScore(label.text, f.name), own: true }))
      .filter((c) => !used.has(c.ref));
    const ref = take(best(candidates));
    if (ref) totals.push({ label: label.text.trim(), ref });
  }

  if (!columns.length && !totals.length) return null;

  // The header: the record's key and date, then what the screen labels.
  const header: Item[] = [];
  for (const k of h.key) {
    const ref = take(`${h.id}.${k}`);
    if (ref) header.push({ label: k.replace(/_/g, ' '), ref });
  }
  const dates = h.fields.filter((f) => f.type === 'D');
  for (const d of dates) {
    const ref = take(`${h.id}.${d.name}`);
    if (ref) header.push({ label: dates.length === 1 ? 'DATE' : d.name.replace(/_/g, ' '), ref });
  }
  for (const l of [...model.labels].sort((a, b) => a.row - b.row || a.col - b.col)) {
    const own: Candidate[] = h.fields
      .filter((f) => str(shape.record[f.name]) && sameValue(l.value, shape.record[f.name]))
      .map((f) => ({ ref: `${h.id}.${f.name}`, score: labelScore(l.label, f.name), own: true }));
    const through: Candidate[] = headLinks.flatMap((x) =>
      x.entity.fields
        .filter((f) => str(x.values[f.name]) && sameValue(l.value, x.values[f.name]))
        .map((f) => ({
          ref: `${x.entity.id}.${f.name}`,
          score: labelScore(l.label, f.name),
          own: false,
        })),
    );
    let ref = take(best([...own, ...through].filter((c) => !used.has(c.ref))));
    let blank: string | undefined;
    if (!ref) {
      // A blank field the label names: the old app showed a word for it (WALK-IN).
      const named = h.fields
        .filter((f) => !str(shape.record[f.name]) && labelScore(l.label, f.name) > 0)
        .map((f) => ({ ref: `${h.id}.${f.name}`, score: labelScore(l.label, f.name), own: true }))
        .filter((c) => !used.has(c.ref));
      ref = take(best(named));
      if (ref && l.value.trim()) blank = l.value.trim();
    }
    if (!ref) continue;
    header.push({ label: l.label.trim(), ref, ...(blank ? { blank } : {}) });
    // What follows it on its row: a field of the record it points at (the customer's name).
    for (const t of model.texts.filter((x) => x.row === l.row && x.col > l.col)) {
      const more = headLinks.flatMap((x) =>
        x.entity.fields
          .filter((f) => str(x.values[f.name]) && sameValue(t.text, x.values[f.name]))
          .map((f) => ({ ref: `${x.entity.id}.${f.name}`, score: 0, own: false })),
      );
      const r = take(best(more.filter((c) => !used.has(c.ref))));
      if (r) header.push({ label: '', ref: r });
    }
  }
  return { header, columns, totals };
}
