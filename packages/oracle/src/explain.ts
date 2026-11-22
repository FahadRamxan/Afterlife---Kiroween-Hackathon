// A difference in one sentence (Prompt 69), for the owner and the developer: what differs, both
// values, and the case. "Old app charged Rs 850.00 GST, new app charged Rs 850.01, on a bill of
// Rs 5000.06 (PAN500 x 400)." Money is a numeric field with two decimals, shown in rupees.
import type { Entity, Soul } from '@afterlife/soul';

type Field = Entity['fields'][number];
import Decimal from 'decimal.js';
import type { ProofCase } from './arbitraries';
import { thresholdsOf } from './arbitraries';
import { normalValue, type Difference } from './compare';
import type { SnapshotDiff } from '@afterlife/dbf';

const isMoney = (f: Field | undefined) => !!f && f.type === 'N' && f.decimals === 2;
const rupees = (v: string) => `Rs ${new Decimal(v || '0').toFixed(2)}`;
/** GST and QTY stay as they are; SUBTOTAL reads as subtotal. */
const label = (field: string) =>
  field.length <= 3 ? field : field.toLowerCase().replace(/_/g, ' ');
const nameOf = (e: Entity | undefined, table: string) =>
  (e?.name ?? table.replace(/\.DBF$/i, '')).toLowerCase();

/** The record the action writes (the bill): its entity, from the action's effects. */
function headerOf(soul: Soul, actionId: string): Entity | undefined {
  const a = soul.actions.find((x) => x.id === actionId);
  const id = a?.effects.find((e) => e.kind === 'insert')?.entity;
  return soul.entities.find((e) => e.id === id);
}

/** "a bill of Rs 5000.06 (PAN500 x 400)": the case as the owner would say it. */
function describeCase(soul: Soul, c: ProofCase, old: SnapshotDiff, vessel: SnapshotDiff): string {
  const header = headerOf(soul, c.actionId);
  const name = nameOf(header, header?.file ?? c.actionId);
  // The amount the rules compare (bill.subtotal > 5000), as the old app wrote it.
  const ruleName = header?.id.replace(/-/g, '_');
  const t = thresholdsOf(soul).find((x) => x.ref.split('.')[0] === ruleName);
  const field = t && header?.fields.find((f) => f.name.toLowerCase() === t.ref.split('.')[1]);
  const written = (d: SnapshotDiff) =>
    header ? d.tables[header.file]?.inserted[0]?.values : undefined;
  const amount = field ? (written(old) ?? written(vessel))?.[field.name] : undefined;
  const lines = (c.inputs.lines ?? []).map((l) => Object.values(l).join(' x ')).join(', ');
  const values = Object.entries(c.inputs.values ?? {})
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
  const parts = lines || values;
  const of =
    amount !== undefined && amount !== null && isMoney(field)
      ? ` of ${rupees(normalValue(amount))}`
      : '';
  return `a ${name}${of}${parts ? ` (${parts})` : ''}`;
}

export type Explained = ProofCase & {
  old: SnapshotDiff;
  vessel: SnapshotDiff;
  differences: Difference[];
};

/** One sentence: the first difference (the written record's own values first), and the case. */
export function explainDifference(soul: Soul, x: Explained): string {
  if (!x.differences.length) return 'The old app and the new app did the same.';
  const header = headerOf(soul, x.actionId);
  // What matters most first: a record of the action only one side wrote (the bill), then the
  // values on it, then a record only one side wrote anywhere, then any value.
  const mine = (y: Difference) => y.table === header?.file;
  const d =
    x.differences.find((y) => mine(y) && !y.field) ??
    x.differences.find((y) => mine(y) && y.field && y.kind === 'inserted') ??
    x.differences.find((y) => !y.field) ??
    x.differences.find((y) => y.field) ??
    x.differences[0]!;
  const entity = soul.entities.find((e) => e.file === d.table);
  const what = nameOf(entity, d.table);
  const f = entity?.fields.find((y) => y.name === d.field);
  const show = (v: string | null) =>
    isMoney(f) ? rupees(v ?? '') : v === '' ? 'blank' : String(v);
  const on = `, on ${describeCase(soul, x, x.old, x.vessel)}`;
  const more =
    x.differences.length > 1
      ? ` ${x.differences.length - 1} other value${x.differences.length > 2 ? 's differ' : ' differs'} too.`
      : '';
  let sentence: string;
  if (!d.field && d.kind === 'inserted' && entity === header) {
    // The record of the action itself (the bill): the case is that record.
    const [who, other] = d.old === null ? ['New', 'old'] : ['Old', 'new'];
    return `${who} app saved ${describeCase(soul, x, x.old, x.vessel)} the ${other} app did not.${more}`;
  } else if (!d.field) {
    const did = d.kind === 'deleted' ? 'deleted' : 'saved';
    const rec = d.values
      ? ` (${Object.entries(d.values)
          .filter(([, v]) => v !== '')
          .slice(0, 3)
          .map(([k, v]) => `${k} ${v}`)
          .join(', ')})`
      : '';
    sentence =
      d.old === null
        ? `New app ${did} a ${what}${rec} the old app did not`
        : `Old app ${did} a ${what}${rec} the new app did not`;
  } else if (isMoney(f) && entity === header) {
    sentence = `Old app charged ${show(d.old)} ${label(d.field)}, new app charged ${show(d.vessel)}`;
  } else if (d.kind === 'updated') {
    sentence = `Old app set ${label(d.field)} of ${what} ${d.record.split(' ').at(-1)} to ${show(d.old)}, new app to ${show(d.vessel)}`;
  } else {
    sentence = `Old app wrote ${label(d.field)} ${show(d.old)} on the ${what}, new app wrote ${show(d.vessel)}`;
  }
  return `${sentence}${on}.${more}`;
}
