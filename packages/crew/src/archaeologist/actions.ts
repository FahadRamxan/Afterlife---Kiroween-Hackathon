// The Soul's actions, from the observations (review of 51-60). An action is what the owner does
// that writes data: saving a bill on NEW BILL wrote one BILLS record, a BILLITEM record per line and
// changed MEDICINE.QTY. For each kind of save this writes the action: its screen, its effects
// (the record it writes, the lines that point at it, the records it changes) and its key macro
// (packages/soul/src/macro.ts), worked out from the keys the Possessor typed into which field.
// Deterministic: no model.
import type { DbfValue, SnapshotDiff } from '@afterlife/dbf';
import { parseKeys, printKeys } from '@afterlife/emulator';
import type { ScreenModel } from '@afterlife/screen';
import { expandMacro, type Action, type Entity } from '@afterlife/soul';
import { activeField } from '../possessor/actions';

/** One step of possession, as inferActions needs it. */
export type ActionStep = {
  id: string;
  keys: string;
  /** The screen the keys were pressed on. */
  screen: { fingerprint: string; title: string };
  /** The screen after them. */
  after: { fingerprint: string; title: string };
  /** The label of the field the keys were typed into ("Code"), or null when none was waiting. */
  field: string | null;
  dbfDiff: SnapshotDiff;
};

type ScreenRecordLike = { fingerprint: string; text?: string[]; model?: ScreenModel | null };
const titleOf = (s: { model?: { title?: { name?: string } | null } | null }) =>
  s.model?.title?.name?.trim() ?? '';

/** A step from a stored observation row: the field is the one the app was waiting on. */
export function stepFromObservation(o: {
  id: string;
  keys: string;
  screenBefore: unknown;
  screenAfter: unknown;
  dbfDiff: unknown;
}): ActionStep {
  const before = o.screenBefore as ScreenRecordLike;
  const after = o.screenAfter as ScreenRecordLike;
  const f = before.model ? activeField(before.model, before.text) : null;
  return {
    id: o.id,
    keys: o.keys,
    screen: { fingerprint: before.fingerprint, title: titleOf(before) },
    after: { fingerprint: after.fingerprint, title: titleOf(after) },
    field: f?.label ?? null,
    dbfDiff: o.dbfDiff as SnapshotDiff,
  };
}

const EMPTY: SnapshotDiff = { tables: {}, unchanged: [], addedTables: [], removedTables: [] };

/**
 * A step from a recorded possession's observation event (apps/worker/recorded): the field is in
 * its label, "Code = PAN500".
 */
export function stepFromEvent(p: {
  id?: unknown;
  keys?: unknown;
  label?: unknown;
  from?: unknown;
  to?: unknown;
  fromFingerprint?: unknown;
  fingerprint?: unknown;
  diff?: unknown;
}): ActionStep {
  const label = typeof p.label === 'string' ? p.label : '';
  const m = /^(?!walk:)(.+?) = /.exec(label);
  return {
    id: String(p.id ?? ''),
    keys: String(p.keys ?? ''),
    screen: { fingerprint: String(p.fromFingerprint ?? ''), title: String(p.from ?? '') },
    after: { fingerprint: String(p.fingerprint ?? ''), title: String(p.to ?? '') },
    field: m ? m[1]!.trim() : null,
    dbfDiff: (p.diff as SnapshotDiff | null) ?? EMPTY,
  };
}

const str = (v: DbfValue | undefined) => (v === null || v === undefined ? '' : String(v).trim());
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);

/** How well a screen label names a field: CUST_ID and "Customer ID (blank = walk-in)" give 2. */
export function labelScore(label: string, field: string): number {
  const said = words(label);
  return words(field.replace(/_/g, ' ')).filter((w) =>
    said.some((s) => s.startsWith(w) || w.startsWith(s)),
  ).length;
}

/** What was typed, and the keys pressed after it ("PAN500{Enter}" is PAN500 and {Enter}). */
function split(keys: string): { typed: string; rest: string } | null {
  let strokes;
  try {
    strokes = parseKeys(keys);
  } catch {
    return null;
  }
  const first = strokes[0];
  if (first?.kind === 'text') return { typed: first.text, rest: printKeys(strokes.slice(1)) };
  return { typed: '', rest: printKeys(strokes) };
}

/** A typed value matches what was stored: the same text (the app may upper-case it), or number. */
function sameValue(typed: string, stored: DbfValue | undefined): boolean {
  const a = typed.trim();
  const b = str(stored);
  if (a.toUpperCase() === b.toUpperCase()) return true;
  if (/^-?\d+(\.\d+)?$/.test(a) && /^-?\d+(\.\d+)?$/.test(b)) return Number(a) === Number(b);
  return false;
}

type Shape = {
  header: Entity;
  lines: Entity | null;
  record: Record<string, DbfValue>;
  lineRecords: Record<string, DbfValue>[];
  updates: { entity: Entity; fields: string[] }[];
};

/** What a save wrote: the record of its own (no link to another inserted one), and its lines. */
function shapeOf(diff: SnapshotDiff, entities: Entity[]): Shape | null {
  const byFile = new Map(entities.map((e) => [e.file.toUpperCase(), e]));
  const inserted = Object.entries(diff.tables)
    .filter(([, t]) => t.inserted.length)
    .map(([f, t]) => ({ entity: byFile.get(f.toUpperCase()), t }))
    .filter((x): x is { entity: Entity; t: SnapshotDiff['tables'][string] } => !!x.entity);
  if (!inserted.length) return null;
  const links = (a: Entity, b: Entity) => a.foreignKeys.some((fk) => fk.references.entity === b.id);
  const heads = inserted.filter((x) => !inserted.some((o) => o !== x && links(x.entity, o.entity)));
  if (heads.length !== 1 || heads[0]!.t.inserted.length !== 1) return null;
  const head = heads[0]!;
  const rest = inserted.filter((x) => x !== head);
  if (rest.length > 1 || rest.some((x) => !links(x.entity, head.entity))) return null;
  const line = rest[0];
  const updates = Object.entries(diff.tables)
    .filter(([, t]) => t.updated.length)
    .map(([f, t]) => ({
      entity: byFile.get(f.toUpperCase()),
      fields: [...new Set(t.updated.flatMap((u) => u.changes.map((c) => c.field)))],
    }))
    .filter((x): x is { entity: Entity; fields: string[] } => !!x.entity);
  return {
    header: head.entity,
    lines: line?.entity ?? null,
    record: head.t.inserted[0]!.values,
    lineRecords: [...(line?.t.inserted ?? [])]
      .sort((a, b) => a.recno - b.recno)
      .map((r) => r.values),
    updates,
  };
}

/**
 * The macro of the steps that led to a save, or null when the keys cannot be explained by the
 * record and its lines: each value typed into a field is matched to the field of the record (or
 * of the next line) it was stored in, by its label and its value; the lines must all be typed the
 * same way; and filling the macro back in must give exactly the keys that were pressed.
 */
export function macroOf(steps: ActionStep[], shape: Shape): string | null {
  type Mapped = {
    step: ActionStep;
    rest: string;
    typed: string;
    to: { scope: 'record' | 'line'; field: string; line: number } | null;
  };
  const mapped: Mapped[] = [];
  let line = 0;
  const assigned: Set<string>[] = shape.lineRecords.map(() => new Set());
  for (const step of steps) {
    const s = split(step.keys);
    if (!s) return null;
    let to: Mapped['to'] = null;
    if (step.field !== null) {
      const fit = (
        scope: 'record' | 'line',
        fields: string[],
        values: Record<string, DbfValue>,
        at: number,
      ) =>
        fields
          .filter((f) => sameValue(s.typed, values[f]))
          .map((f) => ({ scope, field: f, line: at, score: labelScore(step.field!, f) }));
      const options = [
        ...fit(
          'record',
          shape.header.fields.map((f) => f.name),
          shape.record,
          -1,
        ),
        ...(shape.lines
          ? // This line, or the next one once something was typed into this one.
            [line, ...(assigned[line]?.size ? [line + 1] : [])]
              .filter((i) => i < shape.lineRecords.length)
              .flatMap((i) =>
                fit(
                  'line',
                  shape.lines!.fields.map((f) => f.name),
                  shape.lineRecords[i]!,
                  i,
                ).filter((o) => !assigned[i]!.has(o.field)),
              )
          : []),
      ].sort((a, b) => b.score - a.score || a.line - b.line);
      const best = options[0];
      // Only a field its label names: a blank Enter on Code is not the blank customer.
      if (best && best.score > 0) {
        to = { scope: best.scope, field: best.field, line: best.line };
        if (best.scope === 'line') {
          line = best.line;
          assigned[line]!.add(best.field);
        }
      }
    }
    mapped.push({ step, rest: s.rest, typed: s.typed, to });
  }
  const lineSteps = mapped.map((m, i) => ({ m, i })).filter((x) => x.m.to?.scope === 'line');
  let macro: string;
  const piece = (m: Mapped) =>
    m.to ? `{${m.to.scope === 'record' ? '@' : '#'}${m.to.field}}${m.rest}` : m.step.keys;
  if (!lineSteps.length) {
    if (shape.lineRecords.length) return null;
    macro = mapped.map(piece).join('');
  } else {
    const first = lineSteps[0]!.i;
    const last = lineSteps.at(-1)!.i;
    const region = mapped.slice(first, last + 1);
    if (region.some((m) => m.to?.scope !== 'line')) return null;
    const blocks: Mapped[][] = [];
    for (const m of region) {
      if (!blocks[m.to!.line]) blocks[m.to!.line] = [];
      blocks[m.to!.line]!.push(m);
    }
    // Every line typed, in order (Array#some would skip a line no value was typed into).
    if (blocks.length !== shape.lineRecords.length) return null;
    for (let k = 0; k < blocks.length; k++) if (!blocks[k]) return null;
    const template = blocks[0]!.map(piece).join('');
    if (blocks.some((b) => b.map(piece).join('') !== template)) return null;
    macro = `${mapped.slice(0, first).map(piece).join('')}{lines}${template}{/lines}${mapped
      .slice(last + 1)
      .map(piece)
      .join('')}`;
  }
  const values: Record<string, string> = {};
  const lines: Record<string, string>[] = shape.lineRecords.map(() => ({}));
  for (const m of mapped)
    if (m.to?.scope === 'record') values[m.to.field] = m.typed;
    else if (m.to) lines[m.to.line]![m.to.field] = m.typed;
  const canon = (k: string) => printKeys(parseKeys(k));
  try {
    if (canon(expandMacro(macro, { values, lines })) !== canon(steps.map((s) => s.keys).join('')))
      return null;
  } catch {
    return null;
  }
  return macro.length <= 500 ? macro : null;
}

const fieldsOf = (e: Entity, names: Iterable<string>) => {
  const set = new Set(names);
  return e.fields.map((f) => f.name).filter((n) => set.has(n));
};

/**
 * The actions in the observations, in the order they were first seen. Steps are possession's in
 * order. A save on a screen gets the macro of the steps after the app entered that screen (or
 * after the save before it); of all the saves of one kind, the shortest macro that explains its
 * keys is kept. A kind of save no macro explains is still an action, with the save's own keys.
 */
export function inferActions(steps: ActionStep[], entities: Entity[]): Action[] {
  type Group = {
    key: string;
    title: string;
    shape: Shape;
    macros: { macro: string; screen: string }[];
    fallback: { keys: string; screen: string };
    records: Set<string>;
    lineFields: Set<string>;
    updates: Map<string, { entity: Entity; fields: Set<string> }>;
  };
  const groups: Group[] = [];
  steps.forEach((save, i) => {
    const shape = shapeOf(save.dbfDiff, entities);
    if (!shape) return;
    // One action per record written on one screen, however its last key was pressed.
    const key = `${shape.header.id}|${save.screen.title}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = {
        key,
        title: save.screen.title,
        shape,
        macros: [],
        fallback: { keys: save.keys, screen: save.screen.fingerprint },
        records: new Set(),
        lineFields: new Set(),
        updates: new Map(),
      };
      groups.push(g);
    }
    for (const f of Object.keys(shape.record)) g.records.add(f);
    if (!g.shape.lines && shape.lines) g.shape = shape;
    for (const r of shape.lineRecords) for (const f of Object.keys(r)) g.lineFields.add(f);
    for (const u of shape.updates) {
      const x = g.updates.get(u.entity.id) ?? { entity: u.entity, fields: new Set<string>() };
      for (const f of u.fields) x.fields.add(f);
      g.updates.set(u.entity.id, x);
    }
    // Back to where the app entered this screen, or to the save before.
    let start = i;
    while (
      start > 0 &&
      steps[start - 1]!.screen.title === save.screen.title &&
      !shapeOf(steps[start - 1]!.dbfDiff, entities)
    )
      start--;
    for (let s = start; s <= i; s++) {
      const macro = macroOf(steps.slice(s, i + 1), shape);
      if (macro) {
        g.macros.push({ macro, screen: steps[s]!.screen.fingerprint });
        break;
      }
    }
  });
  const used = new Set<string>();
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return groups.map((g) => {
    const h = g.shape.header;
    const verb = g.shape.lines ? 'save' : 'add';
    // Two screens that write the same record (a sale and a payment): each is named after its
    // screen. Otherwise after the record: "Save a bill", "Add a customer".
    const shared = groups.filter((x) => x.shape.header.id === h.id).length > 1 && slug(g.title);
    const base = shared ? slug(g.title) : `${verb}-${h.id}`;
    let id = base.slice(0, 48);
    for (let n = 2; used.has(id) || !/^[a-z]/.test(id); n++) id = `${base}-${n}`.slice(0, 48);
    used.add(id);
    const best = [...g.macros].sort((a, b) => a.macro.length - b.macro.length)[0];
    const title = g.title.charAt(0).toUpperCase() + g.title.slice(1).toLowerCase();
    return {
      id,
      screen: best?.screen ?? g.fallback.screen,
      name: (shared
        ? title
        : `${verb === 'save' ? 'Save' : 'Add'} a ${h.name.toLowerCase()}`
      ).slice(0, 80),
      keys: best?.macro ?? g.fallback.keys,
      effects: [
        { entity: h.id, kind: 'insert' as const, fields: fieldsOf(h, g.records) },
        ...(g.shape.lines
          ? [
              {
                entity: g.shape.lines.id,
                kind: 'insert' as const,
                fields: fieldsOf(g.shape.lines, g.lineFields),
              },
            ]
          : []),
        ...[...g.updates.values()].map((u) => ({
          entity: u.entity.id,
          kind: 'update' as const,
          fields: fieldsOf(u.entity, u.fields),
        })),
      ],
    };
  });
}
