// Refusal rules without a model (Prompt 81). The old app refuses some numbers as they are typed:
// Shifa says "ONLY 5 IN STOCK" when a line asks for more than the medicine's stock, and saves the
// bill without that line. Nothing is written, so the effect rules never see it. Here each number
// typed at a line field is a line attempt, with the record its line points at (the medicine whose
// code was typed just before, as it stood then) and whether the old app took it. A refusal rule
// compares the number with a numeric field of that record (`bill_item.qty <= medicine.qty`) and
// is kept only when every attempt agrees: true of each one taken, false of each one refused.
// When the attempts cannot tell (no line refused yet, or none at exactly the boundary), the
// boundary is probed in the old app: a line at the field's value, and one over it.
import Decimal from 'decimal.js';
import type { DbfValue, SnapshotDiff } from '@afterlife/dbf';
import { macroFields, type Entity, type Rule, type Soul } from '@afterlife/soul';
import { ruleName } from './hypotheses';
type ScreenSide = {
  text?: string[];
  model?: {
    fields?: {
      label: string | null;
      focused: boolean;
      value?: string;
      row?: number;
      col?: number;
    }[];
    messages?: { text: string }[];
  } | null;
};
/** One step of the old app: the keys, the screens before and after, what it wrote. */
export type AttemptStep = {
  id: string;
  keys: string;
  screenBefore: ScreenSide;
  screenAfter: ScreenSide;
  dbfDiff: SnapshotDiff;
  /** The first step after the old app was booted again: its records are the data files' again. */
  fresh?: boolean;
};
export type LineAttempt = {
  action: string;
  /** The line's entity (bill-item) and the field typed (QTY). */
  entity: string;
  field: string;
  value: string;
  /** The entity the line points at (medicine), and its record as it was when the line was typed. */
  linkedEntity: string | null;
  linked: { values: Record<string, DbfValue> } | null;
  accepted: boolean;
  /** The step that typed it. */
  observation: string;
};
type Draft = Pick<Soul, 'entities' | 'actions'>;
type Tables = Record<string, { values: Record<string, DbfValue> }[]>;
const words = (s: string): string[] => s.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
const text = (v: DbfValue | undefined) => (v === null || v === undefined ? '' : String(v).trim());
const isNumber = (s: string) => /^-?\d+(\.\d+)?$/.test(s);
/** The number typed in one step: "80{Enter}" is 80; anything else is not a typed number. */
const typed = (keys: string) => /^([^{}]+)\{(Enter|Tab)\}$/.exec(keys)?.[1]?.trim() ?? null;
/** The macro field the step typed into: the focused field's label names it ("Qty" is QTY). */
function fieldOf(step: AttemptStep, fields: string[]): string | null {
  const all = step.screenBefore.model?.fields ?? [];
  // The field being typed: the focused one; when the cursor has blinked off, the first empty one.
  const f = all.find((x) => x.focused) ?? all.find((x) => !x.value);
  if (!f) return null;
  // A box the screen reader left unlabelled ("Code: PAN500   Qty:" before it): the words after
  // the last wide gap before it, up to the colon.
  let label = f.label;
  if (!label && f.row !== undefined && f.col !== undefined) {
    const head = (step.screenBefore.text?.[f.row] ?? '').slice(0, f.col).trimEnd();
    if (head.endsWith(':'))
      label =
        head
          .slice(0, -1)
          .split(/\s{2,}/)
          .at(-1)
          ?.trim() ?? null;
  }
  if (!label) return null;
  const w = words(label);
  return (
    fields.find((f) => w.join('_') === f) ??
    fields.find((f) => w.includes(f)) ??
    fields.find((f) => f.split('_').some((p) => p.length > 1 && w.includes(p))) ??
    null
  );
}
const messagesOf = (s: ScreenSide) => (s.model?.messages ?? []).map((m) => m.text.trim());
/** A message on the screen after the step that was not there before it. */
const newMessage = (step: AttemptStep) => {
  const before = new Set(messagesOf(step.screenBefore));
  return messagesOf(step.screenAfter).some((m) => m && !before.has(m));
};
/** The records of every file, as the steps so far left them (stock goes down with each bill). */
function applyDiff(
  state: Map<string, Record<string, DbfValue>[]>,
  d: SnapshotDiff,
  keys: Map<string, string>,
) {
  for (const [file, t] of Object.entries(d.tables)) {
    const key = keys.get(file.toUpperCase());
    const rows = state.get(file.toUpperCase());
    if (!rows || !key) continue;
    for (const u of t.updated) {
      const r = rows.find((x) => text(x[key]) === text(u.key));
      if (r) for (const c of u.changes) r[c.field] = c.after;
    }
    for (const i of t.inserted) rows.push({ ...i.values });
  }
}
/** Each number typed at a line field, with the record the line points at and the old app's answer. */
export function lineAttempts(steps: AttemptStep[], draft: Draft, tables: Tables): LineAttempt[] {
  const byId = new Map(draft.entities.map((e) => [e.id, e]));
  const keys = new Map(draft.entities.map((e) => [e.file.toUpperCase(), e.key[0] ?? '']));
  const state = new Map(
    Object.entries(tables).map(([f, rows]) => [
      f.toUpperCase(),
      rows.map((r) => ({ ...r.values })),
    ]),
  );
  // The actions that type lines: their line entity, the line fields typed, and the link field.
  const lineActions = draft.actions.flatMap((a) => {
    const fields = macroFields(a.keys).line;
    const line = a.effects
      .filter((e) => e.kind === 'insert')
      .map((e) => byId.get(e.entity))
      .find((e) => e && fields.every((f) => e.fields.some((x) => x.name === f)));
    if (!fields.length || !line) return [];
    const link = line.foreignKeys.find(
      (fk) => fk.fields.length === 1 && fields.includes(fk.fields[0]!),
    );
    return [{ action: a, line, fields, link: link ?? null }];
  });
  const out: LineAttempt[] = [];
  for (const la of lineActions) {
    const numeric = new Set(la.line.fields.filter((f) => f.type === 'N').map((f) => f.name));
    const linkField = la.link?.fields[0] ?? null;
    const target = la.link ? byId.get(la.link.references.entity) : undefined;
    let code: string | null = null;
    let linked: Record<string, DbfValue> | null = null;
    let pending: LineAttempt[] = [];
    for (const step of steps) {
      if (step.fresh) {
        // A fresh boot (a probe): the records are the bundle's again, and nothing is pending.
        for (const [f, rows] of Object.entries(tables))
          state.set(
            f.toUpperCase(),
            rows.map((r) => ({ ...r.values })),
          );
        pending = [];
        linked = null;
      }
      const field = fieldOf(step, la.fields);
      const value = typed(step.keys);
      if (field && value !== null) {
        if (field === linkField) {
          code = value;
          const rows = target ? state.get(target.file.toUpperCase()) : undefined;
          const key = la.link!.references.fields[0]!;
          const r = rows?.find((x) => text(x[key]).toUpperCase() === value.toUpperCase());
          linked = r ? { ...r } : null;
        } else if (numeric.has(field) && isNumber(value)) {
          const a: LineAttempt = {
            action: la.action.id,
            entity: la.line.id,
            field,
            value,
            linkedEntity: target?.id ?? null,
            linked: linked ? { values: linked } : null,
            accepted: true,
            observation: step.id,
          };
          // Refused at once: a message came up and the step wrote nothing.
          if (newMessage(step)) out.push({ ...a, accepted: false });
          else pending.push(a);
        }
      }
      const written =
        step.dbfDiff.tables[la.line.file] ?? step.dbfDiff.tables[la.line.file.toUpperCase()];
      if (written?.inserted.length) {
        // The save: a line typed is taken when a line with its code and value was written.
        for (const a of pending) {
          const hit = written.inserted.some(
            (r) =>
              new Decimal(text(r.values[a.field]) || 'NaN').eq(a.value) &&
              (!linkField ||
                !a.linked ||
                text(r.values[linkField]).toUpperCase() ===
                  text(a.linked.values[la.link!.references.fields[0]!]).toUpperCase()),
          );
          if (hit) out.push(a);
        }
        pending = [];
        code = null;
        linked = null;
      } else if (/\{Esc\}/.test(step.keys)) {
        // Left without saving: what was typed is not known to be taken.
        pending = [];
      }
      applyDiff(state, step.dbfDiff, keys);
    }
    void code;
  }
  return out.sort(
    (a, b) =>
      steps.findIndex((s) => s.id === a.observation) -
      steps.findIndex((s) => s.id === b.observation),
  );
}
const OPS = ['<=', '<'] as const;
type Op = (typeof OPS)[number];
const holds = (op: Op, a: Decimal, b: Decimal) => (op === '<=' ? a.lte(b) : a.lt(b));
/** The comparisons every attempt agrees with, per typed field and record field. */
function fits(attempts: LineAttempt[], field: string) {
  const ok: Op[] = [];
  for (const op of OPS) {
    const all = attempts.every((a) => {
      const v = text(a.linked?.values[field]);
      if (!isNumber(v)) return false;
      return holds(op, new Decimal(a.value), new Decimal(v)) === a.accepted;
    });
    if (all) ok.push(op);
  }
  return ok;
}
export type Undecided = {
  action: string;
  entity: string;
  field: string;
  linkedEntity: string;
  linkedField: string;
  expressions: string[];
};
/**
 * The refusal rules the attempts support: for each typed line field and each numeric field of
 * the record it points at, the comparisons true of every taken attempt and false of every refused
 * one, with at least one of each. One that fits alone is a rule; two that fit (no attempt at
 * exactly the boundary) are undecided, for the probes.
 */
export function inferRefusals(
  attempts: LineAttempt[],
  draft: Pick<Soul, 'entities' | 'actions'>,
): { rules: Rule[]; undecided: Undecided[] } {
  const byId = new Map(draft.entities.map((e) => [e.id, e]));
  const rules: Rule[] = [];
  const undecided: Undecided[] = [];
  const groups = new Map<string, LineAttempt[]>();
  for (const a of attempts) {
    if (!a.linkedEntity || !a.linked) continue;
    const k = `${a.action}|${a.entity}|${a.field}|${a.linkedEntity}`;
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  for (const group of groups.values()) {
    if (!group.some((a) => !a.accepted) || !group.some((a) => a.accepted)) continue;
    const [first] = group;
    const target: Entity | undefined = byId.get(first!.linkedEntity!);
    for (const f of target?.fields.filter((x) => x.type === 'N') ?? []) {
      const ok = fits(group, f.name);
      if (!ok.length) continue;
      const left = `${ruleName(first!.entity)}.${first!.field.toLowerCase()}`;
      const right = `${ruleName(target!.id)}.${f.name.toLowerCase()}`;
      const exprs = ok.map((op) => `${left} ${op} ${right}`);
      if (exprs.length > 1) {
        undecided.push({
          action: first!.action,
          entity: first!.entity,
          field: first!.field,
          linkedEntity: target!.id,
          linkedField: f.name,
          expressions: exprs,
        });
        continue;
      }
      const words = (id: string) => id.replace(/-/g, ' ');
      rules.push({
        id: `${first!.entity}-${first!.field.toLowerCase()}-within-${target!.id}-${f.name.toLowerCase()}`,
        kind: 'validate',
        en: `A ${words(first!.entity)} ${first!.field.toLowerCase()} larger than the ${words(target!.id)} ${f.name.toLowerCase()}${ok[0] === '<' ? ' or equal to it' : ''} is refused when it is typed.`,
        ur: '',
        expression: exprs[0]!,
        evidence: group.map((a) => a.observation),
        confidence: 1,
      } as Rule);
    }
  }
  return { rules, undecided };
}
export type RefusalProbe = {
  actionId: string;
  why: string;
  inputs: { values: Record<string, string>; lines: Record<string, string>[] };
};
/** At most this many probe bills per round: each boots the old app. */
export const MAX_REFUSAL_PROBES = 4;
/**
 * The bills that decide the refusal rules: for each typed line number whose record has a numeric
 * field the attempts cannot decide, a line at exactly the field's value and one over it, on a
 * record the old app already took a line of (so nothing else refuses it). The app boots fresh for
 * each, so the values are the ones in its data files.
 */
export function refusalProbes(
  draft: Draft,
  attempts: LineAttempt[],
  tables: Tables,
): RefusalProbe[] {
  const byId = new Map(draft.entities.map((e) => [e.id, e]));
  const { rules, undecided } = inferRefusals(attempts, draft);
  const decided = new Set(
    rules.map((r) => `${r.expression.split(' ')[0]}|${r.expression.split(' ').at(-1)}`),
  );
  const out: RefusalProbe[] = [];
  for (const a of draft.actions) {
    const { record, line } = macroFields(a.keys);
    const mine = attempts.filter((x) => x.action === a.id);
    const taken = mine.find((x) => x.accepted && x.linked);
    if (!taken || !taken.linkedEntity) continue;
    const target = byId.get(taken.linkedEntity)!;
    const linkKey = target.key[0]!;
    const code = text(taken.linked!.values[linkKey]);
    const fresh = (tables[target.file] ?? tables[target.file.toUpperCase()] ?? []).find(
      (r) => text(r.values[linkKey]) === code,
    );
    if (!fresh) continue;
    const linkField = byId
      .get(taken.entity)
      ?.foreignKeys.find((fk) => fk.references.entity === target.id)?.fields[0];
    for (const f of target.fields.filter((x) => x.type === 'N')) {
      const left = `${ruleName(taken.entity)}.${taken.field.toLowerCase()}`;
      const right = `${ruleName(target.id)}.${f.name.toLowerCase()}`;
      if (decided.has(`${left}|${right}`)) continue;
      const refusedHere = mine.some((x) => !x.accepted);
      const open = undecided.some((u) => u.linkedField === f.name && u.field === taken.field);
      if (refusedHere && !open) continue;
      const v = text(fresh.values[f.name]);
      // Only a whole number can be typed as a quantity.
      if (!/^\d+(\.0+)?$/.test(v) || new Decimal(v).lte(0)) continue;
      const at = new Decimal(v).toFixed(0);
      for (const q of [at, new Decimal(at).plus(1).toFixed(0)]) {
        out.push({
          actionId: a.id,
          why: `${left} against ${right}`,
          inputs: {
            values: Object.fromEntries(record.map((r) => [r, ''])),
            lines: [
              Object.fromEntries(
                line.map((l) => [l, l === linkField ? code : l === taken.field ? q : '']),
              ),
            ],
          },
        });
      }
    }
  }
  return out.slice(0, MAX_REFUSAL_PROBES);
}
