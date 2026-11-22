// Receipts (Prompt 61): a saved bill set out the way the old app showed it. The layout is the
// action's `receipt` in the Soul (the Archaeologist reads it off the screen the old app saved on);
// without one, a default from the action's fields. A receipt becomes plain lines for an 80 mm
// thermal printer and WhatsApp, and a one-page PDF in Courier, written here by hand: no library,
// no network.
import Decimal from 'decimal.js';
import type { DbfValue } from '@afterlife/dbf';
import type { Entity, ReceiptLayout, Soul } from '@afterlife/soul';
import type { EntityStore } from './store';

export type Receipt = {
  shop: string;
  header: { label: string; value: string }[];
  columns: { label: string; align: 'left' | 'right' }[];
  rows: string[][];
  totals: { label: string; value: string }[];
};

/** Characters per line on an 80 mm thermal printer (Font A, 12 cpi). */
export const RECEIPT_WIDTH = 42;

type Values = Record<string, DbfValue>;
type Item = ReceiptLayout['header'][number];

const str = (v: DbfValue | undefined) => (v === null || v === undefined ? '' : String(v).trim());

function entities(soul: Soul, actionId: string) {
  const action = soul.actions.find((a) => a.id === actionId);
  if (!action) throw new Error(`The Soul has no action ${actionId}`);
  const byId = new Map(soul.entities.map((e) => [e.id, e]));
  const inserts = action.effects.filter((e) => e.kind === 'insert').map((e) => byId.get(e.entity)!);
  const header = inserts.find(
    (e) => !inserts.some((o) => o !== e && e.foreignKeys.some((f) => f.references.entity === o.id)),
  )!;
  const line =
    inserts.find(
      (e) => e !== header && e.foreignKeys.some((f) => f.references.entity === header.id),
    ) ?? null;
  return { action, byId, header, line };
}

/** The action's receipt layout, or one from its fields: key, dates, links; lines; numbers. */
export function receiptLayout(soul: Soul, actionId: string): ReceiptLayout {
  const { action, header, line } = entities(soul, actionId);
  if (action.receipt) return action.receipt;
  const at = (e: Entity, f: string) => ({ label: f.replace(/_/g, ' '), ref: `${e.id}.${f}` });
  const links = header.foreignKeys.flatMap((fk) => fk.fields);
  const top = [
    ...header.key,
    ...header.fields.filter((f) => f.type === 'D').map((f) => f.name),
    ...links,
  ].filter((f, i, all) => all.indexOf(f) === i);
  const numbers = header.fields.filter((f) => f.type === 'N' && !top.includes(f.name));
  if (!line)
    return {
      header: [...top, ...header.fields.filter((f) => f.type !== 'N').map((f) => f.name)]
        .filter((f, i, all) => all.indexOf(f) === i)
        .map((f) => at(header, f)),
      columns: [],
      totals: numbers.map((f) => at(header, f.name)),
    };
  const parent = new Set(
    line.foreignKeys.filter((fk) => fk.references.entity === header.id).flatMap((fk) => fk.fields),
  );
  // The line's position is the "#" column; a numbered field the counters fill is left out.
  const position = line.fields.find(
    (f) => f.type === 'N' && f.decimals === 0 && line.key.includes(f.name) && !parent.has(f.name),
  );
  return {
    header: top.map((f) => at(header, f)),
    columns: [
      { label: '#', ref: '#' },
      ...line.fields
        .filter((f) => !parent.has(f.name) && f.name !== position?.name)
        .map((f) => at(line, f.name)),
    ],
    totals: numbers.map((f) => at(header, f.name)),
  };
}

/** A value as the old app showed it: money to its decimals, a date as DD/MM/YY. */
function shown(e: Entity | undefined, field: string, v: DbfValue | undefined): string {
  const f = e?.fields.find((x) => x.name === field);
  const s = str(v);
  if (!f || !s) return s;
  if (f.type === 'D' && /^\d{8}$/.test(s))
    return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(2, 4)}`;
  if (f.type === 'N' && /^-?\d+(\.\d+)?$/.test(s)) return new Decimal(s).toFixed(f.decimals);
  return s;
}

/** The receipt of a saved record and its lines, read through the layout. */
export async function receiptOf(
  soul: Soul,
  actionId: string,
  saved: { record: Values; lines: Values[] },
  store: EntityStore,
): Promise<Receipt> {
  const { byId, header, line } = entities(soul, actionId);
  const layout = receiptLayout(soul, actionId);
  const files = new Map<string, Values[]>();
  const recordsOf = async (e: Entity) => {
    if (!files.has(e.id))
      files.set(
        e.id,
        (await store.records(e.file)).filter((r) => !r.deleted).map((r) => r.values),
      );
    return files.get(e.id)!;
  };
  /** The record `from` points at in entity `to` (the line's medicine, the bill's customer). */
  const pointed = async (from: Entity, values: Values, to: Entity): Promise<Values | undefined> => {
    const fk = from.foreignKeys.find((f) => f.references.entity === to.id && f.fields.length === 1);
    const ref = fk ? str(values[fk.fields[0]!]) : '';
    if (!fk || !ref) return undefined;
    return (await recordsOf(to)).find((r) => str(r[fk.references.fields[0]!]) === ref);
  };
  const value = async (item: Item, of: Entity, values: Values, n?: number) => {
    if (item.ref === '#') return String(n ?? '');
    const [id, field] = item.ref.split('.') as [string, string];
    const e = byId.get(id);
    const v = e === of ? values[field] : e ? (await pointed(of, values, e))?.[field] : undefined;
    const s = shown(e, field, v);
    return s || item.blank || '';
  };
  const head: Receipt['header'] = [];
  for (const item of layout.header) {
    const v = await value(item, header, saved.record);
    // A line with no label belongs to the one before it: "Customer: C0002 NASREEN BIBI".
    if (!item.label && head.length) {
      if (v) head[head.length - 1]!.value = `${head.at(-1)!.value} ${v}`.trim();
    } else head.push({ label: item.label, value: v });
  }
  const rows: string[][] = [];
  for (const [i, l] of saved.lines.entries()) {
    const row: string[] = [];
    for (const c of layout.columns) row.push(line ? await value(c, line, l, i + 1) : '');
    rows.push(row);
  }
  const totals: Receipt['totals'] = [];
  for (const t of layout.totals)
    totals.push({ label: t.label, value: await value(t, header, saved.record) });
  return {
    shop: soul.app.name,
    header: head,
    columns: layout.columns.map((c) => {
      if (c.ref === '#') return { label: c.label, align: 'right' as const };
      const [id, field] = c.ref.split('.') as [string, string];
      const f = byId.get(id)?.fields.find((x) => x.name === field);
      return { label: c.label, align: f?.type === 'N' ? ('right' as const) : ('left' as const) };
    }),
    rows,
    totals,
  };
}

/** A line cut into pieces no wider than the paper. */
const wrap = (s: string, w = RECEIPT_WIDTH) => {
  const out: string[] = [];
  for (let i = 0; i < s.length || !out.length; i += w) out.push(s.slice(i, i + w));
  return out;
};
const padLeft = (s: string, w: number) => ' '.repeat(Math.max(0, w - s.length)) + s;

/**
 * The receipt as plain lines, at most RECEIPT_WIDTH long: the shop, the header, each line with
 * its words on one line and its numbers right-aligned under them, then the totals.
 */
export function receiptText(r: Receipt): string {
  const W = RECEIPT_WIDTH;
  const rule = '-'.repeat(W);
  const out: string[] = [];
  const add = (s: string) => out.push(...wrap(s.trimEnd()));
  add(padLeft(r.shop, Math.floor((W + r.shop.length) / 2)));
  for (const h of r.header) add(h.label ? `${h.label}: ${h.value}` : h.value);
  if (r.columns.length) {
    out.push(rule);
    // The words (and the line number) on one line, the numbers under them on the next.
    const all = r.columns.map((_, i) => i);
    const words = all.filter((i) => r.columns[i]!.align === 'left' || i === 0);
    const nums = all.filter((i) => !words.includes(i));
    const width = (i: number) =>
      Math.max(r.columns[i]!.label.length, ...r.rows.map((row) => (row[i] ?? '').length));
    const numbers = (cells: string[]) =>
      padLeft(nums.map((i) => padLeft(cells[i] ?? '', width(i))).join('  '), W);
    const both = (cells: string[]) => {
      add(words.map((i) => cells[i] ?? '').join(' '));
      if (nums.length) add(numbers(cells));
    };
    both(r.columns.map((c) => c.label));
    out.push(rule);
    for (const row of r.rows) both(row);
  }
  if (r.totals.length) {
    out.push(rule);
    for (const t of r.totals) {
      const gap = W - t.label.length - t.value.length;
      add(gap >= 1 ? `${t.label}${' '.repeat(gap)}${t.value}` : `${t.label} ${t.value}`);
    }
  }
  out.push(rule);
  return out.join('\n');
}

/** A WhatsApp link that opens a chat with the receipt in it (monospaced, so it lines up). */
export function receiptWhatsApp(r: Receipt): string {
  return `https://wa.me/?text=${encodeURIComponent(`\`\`\`\n${receiptText(r)}\n\`\`\``)}`;
}

/** A PDF string: ( ) and \ escaped, Latin-1 above ASCII as octal, anything else as "?". */
function pdfString(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`;
    else if (c >= 0x20 && c <= 0x7e) out += ch;
    else if (c >= 0xa0 && c <= 0xff) out += `\\${c.toString(8).padStart(3, '0')}`;
    else out += '?';
  }
  return `(${out})`;
}

/**
 * The receipt as a one-page PDF 1.4, 80 mm (226.77 pt) wide and as long as it needs, in 8 pt
 * Courier: the same lines as receiptText.
 */
export function receiptPdf(r: Receipt): Uint8Array {
  const lines = receiptText(r).split('\n');
  const size = 8;
  const leading = 10;
  const margin = 12;
  const width = 226.77;
  const height = margin * 2 + lines.length * leading;
  const stream = [
    'BT',
    `/F1 ${size} Tf`,
    `${leading} TL`,
    `${margin} ${height - margin - size} Td`,
    ...lines.map((l, i) => `${i ? 'T* ' : ''}${pdfString(l)} Tj`),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Every character is 7-bit, so the string's length is its length in bytes.
  return new TextEncoder().encode(pdf);
}
