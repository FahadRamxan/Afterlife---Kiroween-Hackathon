// Rule hypotheses (Prompt 54): for each number the old app wrote into its data files, the model
// proposes 3 to 5 candidate rules in our DSL, including the rounding and threshold variants a 1998
// programmer could have written. The model only proposes: each candidate is checked here (it must
// parse and use only the fields shown), and against every observation in Prompt 55.
import { readFileSync } from 'node:fs';
import type { DbfValue, SnapshotDiff } from '@afterlife/dbf';
import { parseExpr, type Expr } from '@afterlife/soul';
import { z } from 'zod';
import type { CrewLlm } from '../llm/runtime';

/** What an effect needs of an observation (the stored row). */
export type EffectObservation = {
  id: string;
  keys: string;
  screenBefore: {
    model?: {
      title?: { name?: string } | null;
      fields?: { label: string | null; value: string }[];
      labels?: { label: string; value: string }[];
    };
  };
  dbfDiff: SnapshotDiff;
};

export type Effect = {
  observation: string;
  file: string;
  entity: string;
  /** The rule's lower-case name of the field (bill.gst is entity "bill", field "gst"). */
  field: string;
  kind: 'inserted' | 'changed';
  before: string | null;
  after: string;
  delta: string | null;
  /** The record as it is after, by lower-case field name. */
  record: Record<string, string>;
};

/** An entity id as a rule names it: bill-item is bill_item (a dash would read as a minus). */
export const ruleName = (id: string) => id.replace(/-/g, '_');

const NUMBER = /^-?\d+(\.\d+)?$/;
const text = (v: DbfValue | undefined) => (v === null || v === undefined ? '' : String(v).trim());
const lower = (values: Record<string, DbfValue>) =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k.toLowerCase(), text(v)]));

/**
 * Each number an action wrote: every number field of an inserted record (a new bill's subtotal,
 * discount, GST, total), and every number field it changed, with its delta (a stock going down).
 * Key fields and counters are left to Prompt 53.
 */
export function effectsOf(
  observations: EffectObservation[],
  entities: { id: string; file: string; key?: string[]; counters?: { field: string }[] }[],
): Effect[] {
  const out: Effect[] = [];
  for (const o of observations)
    for (const [file, t] of Object.entries(o.dbfDiff.tables)) {
      const e = entities.find((x) => x.file.toUpperCase() === file.toUpperCase());
      if (!e) continue;
      const skip = new Set([...(e.key ?? []), ...(e.counters ?? []).map((c) => c.field)]);
      for (const r of t.inserted)
        for (const [name, v] of Object.entries(r.values)) {
          const after = text(v);
          if (skip.has(name) || !NUMBER.test(after) || !after.includes('.')) continue;
          out.push({
            observation: o.id,
            file,
            entity: e.id,
            field: name.toLowerCase(),
            kind: 'inserted',
            before: null,
            after,
            delta: null,
            record: lower(r.values),
          });
        }
      for (const u of t.updated)
        for (const c of u.changes) {
          const after = text(c.after);
          if (skip.has(c.field) || !NUMBER.test(after)) continue;
          const record = { ...(u.key && t.key ? { [t.key.toLowerCase()]: u.key } : {}) };
          for (const x of u.changes) record[x.field.toLowerCase()] = text(x.after);
          out.push({
            observation: o.id,
            file,
            entity: e.id,
            field: c.field.toLowerCase(),
            kind: 'changed',
            before: text(c.before),
            after,
            delta: c.delta ?? null,
            record,
          });
        }
    }
  return out;
}

/** The prompt template: packages/crew/prompts/rule-hypotheses.md, its "system" and "user" parts. */
function loadTemplate(): { system: string; user: string } {
  const md = readFileSync(
    new URL('../../prompts/rule-hypotheses.md', import.meta.url),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const part = (name: string) => {
    const m = new RegExp(`^## ${name}\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm').exec(md);
    if (!m) throw new Error(`prompts/rule-hypotheses.md has no "## ${name}" part`);
    return m[1]!.trim();
  };
  return { system: part('system'), user: part('user') };
}
export const HYPOTHESES_TEMPLATE = loadTemplate();

/** Fills {{name}} placeholders; a placeholder without a value is an error, not left in. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (!(name in values)) throw new Error(`The template needs a value for ${name}`);
    return values[name]!;
  });
}

export const MIN_CANDIDATES = 3;
export const MAX_CANDIDATES = 5;

/** The fields a candidate may use: the effect's record (not the field itself) and the records the same action wrote. */
function allowedFields(
  effect: Effect,
  observation: EffectObservation,
  entities: Map<string, string>,
): Set<string> {
  const out = new Set<string>();
  for (const k of Object.keys(effect.record))
    if (k !== effect.field) out.add(`${ruleName(effect.entity)}.${k}`);
  for (const [file, t] of Object.entries(observation.dbfDiff.tables)) {
    const id = entities.get(file.toUpperCase());
    if (!id || id === effect.entity) continue;
    for (const r of [...t.inserted, ...t.deleted])
      for (const k of Object.keys(r.values)) out.add(`${ruleName(id)}.${k.toLowerCase()}`);
    for (const u of t.updated)
      for (const c of u.changes) out.add(`${ruleName(id)}.${c.field.toLowerCase()}`);
  }
  out.add('today');
  return out;
}

/** The record names an expression uses (entity.field, or a single name), lambda parameters left out. */
function refsOf(e: Expr, bound: Set<string> = new Set()): string[] {
  switch (e.type) {
    case 'ref':
      return bound.has(e.path[0]!) ? [] : [e.path.join('.')];
    case 'unary':
      return refsOf(e.arg, bound);
    case 'binary':
      return [...refsOf(e.left, bound), ...refsOf(e.right, bound)];
    case 'if':
      return [...refsOf(e.cond, bound), ...refsOf(e.then, bound), ...refsOf(e.else, bound)];
    case 'call':
      return e.args.flatMap((a) => refsOf(a, bound));
    case 'lambda':
      return refsOf(e.body, new Set([...bound, e.param]));
    default:
      return [];
  }
}

const lines = (o: Record<string, string>, prefix = '') =>
  Object.entries(o)
    .map(([k, v]) => `  ${prefix}${k} = ${v}`)
    .join('\n');

export function promptFor(
  effect: Effect,
  observations: EffectObservation[],
  entities: { id: string; file: string }[] = [],
): { system: string; user: string } {
  const o = observations.find((x) => x.id === effect.observation)!;
  const ids = new Map(entities.map((e) => [e.file.toUpperCase(), e.id]));
  if (!ids.has(effect.file.toUpperCase())) ids.set(effect.file.toUpperCase(), effect.entity);
  const related: string[] = [];
  for (const [file, t] of Object.entries(o.dbfDiff.tables)) {
    const id = ruleName(ids.get(file.toUpperCase()) ?? file.replace(/\.DBF$/i, '').toLowerCase());
    if (
      file === effect.file &&
      effect.kind === 'inserted' &&
      t.updated.length === 0 &&
      t.inserted.length <= 1
    )
      continue;
    for (const r of t.inserted)
      related.push(
        `  ${id} inserted: ${Object.entries(lower(r.values))
          .map(([k, v]) => `${k} = ${v}`)
          .join(', ')}`,
      );
    for (const u of t.updated)
      for (const c of u.changes)
        related.push(`  ${id}.${c.field.toLowerCase()}: ${text(c.before)} -> ${text(c.after)}`);
  }
  const m = o.screenBefore.model ?? {};
  const inputs = (m.fields ?? [])
    .filter((f) => f.value.trim())
    .map((f) => `  ${f.label ?? '(no label)'}: ${f.value.trim()}`);
  const labels = (m.labels ?? []).map((l) => `  ${l.label}: ${l.value}`);
  const values = {
    min: String(MIN_CANDIDATES),
    max: String(MAX_CANDIDATES),
    entity: ruleName(effect.entity),
    field: effect.field,
    file: effect.file,
    kind: effect.kind,
    change:
      effect.kind === 'changed'
        ? `It changed from ${effect.before} to ${effect.after} (${effect.delta ?? 'no delta'}).`
        : `It was written as ${effect.after} in a new record.`,
    record: lines(
      Object.fromEntries(Object.entries(effect.record).filter(([k]) => k !== effect.field)),
    ),
    related: related.length
      ? `What the same action also wrote:\n${related.join('\n')}`
      : 'The action wrote nothing else.',
    screen: `${m.title?.name?.trim() || 'a screen'}, keys ${o.keys}`,
    inputs: inputs.length ? inputs.join('\n') : '  (no values typed in)',
    labels: labels.length ? labels.join('\n') : '  (none)',
  };
  return {
    system: renderTemplate(HYPOTHESES_TEMPLATE.system, values),
    user: renderTemplate(HYPOTHESES_TEMPLATE.user, values),
  };
}

export type Hypotheses = {
  /** entity.field */
  target: string;
  effect: Effect;
  candidates: { expression: string; why: string }[];
};

/** 3 to 5 candidate rules for one effect, each checked: it parses, uses only fields shown, and is new. */
export async function hypothesesFor(
  effect: Effect,
  observations: EffectObservation[],
  llm: CrewLlm,
  entities: { id: string; file: string }[] = [],
): Promise<Hypotheses> {
  const o = observations.find((x) => x.id === effect.observation);
  if (!o) throw new Error(`No observation ${effect.observation}`);
  const ids = new Map(entities.map((e) => [e.file.toUpperCase(), e.id]));
  if (!ids.has(effect.file.toUpperCase())) ids.set(effect.file.toUpperCase(), effect.entity);
  // Related records of a table not named in `entities` go by their file's name.
  for (const file of Object.keys(o.dbfDiff.tables))
    if (!ids.has(file.toUpperCase()))
      ids.set(file.toUpperCase(), file.replace(/\.DBF$/i, '').toLowerCase());
  const allowed = allowedFields(effect, o, ids);
  const schema = z.object({
    candidates: z
      .array(
        z.object({
          expression: z
            .string()
            .min(1)
            .max(2000)
            .superRefine((src, ctx) => {
              let ast: Expr;
              try {
                ast = parseExpr(src);
              } catch (e) {
                ctx.addIssue({
                  code: 'custom',
                  message: `not a valid rule: ${(e as Error).message}`,
                });
                return;
              }
              for (const r of new Set(refsOf(ast)))
                if (!allowed.has(r))
                  ctx.addIssue({ code: 'custom', message: `${r} is not one of the fields shown` });
            }),
          why: z.string().max(300),
        }),
      )
      .min(MIN_CANDIDATES)
      .max(MAX_CANDIDATES)
      .superRefine((cs, ctx) => {
        const seen = new Set<string>();
        cs.forEach((c, i) => {
          const k = c.expression.replace(/\s+/g, '');
          if (seen.has(k))
            ctx.addIssue({
              code: 'custom',
              path: [i, 'expression'],
              message: 'the same candidate twice',
            });
          seen.add(k);
        });
      }),
  });
  const p = promptFor(effect, observations, entities);
  const r = await llm.json(
    schema,
    {
      system: p.system,
      messages: [{ role: 'user', content: [{ type: 'text', text: p.user }] }],
      maxTokens: 1200,
      describe: `${MIN_CANDIDATES} to ${MAX_CANDIDATES} candidate rules for ${effect.entity}.${effect.field}.`,
    },
    { agent: 'archaeologist', purpose: `rule hypotheses for ${effect.entity}.${effect.field}` },
  );
  return { target: `${ruleName(effect.entity)}.${effect.field}`, effect, candidates: r.candidates };
}
