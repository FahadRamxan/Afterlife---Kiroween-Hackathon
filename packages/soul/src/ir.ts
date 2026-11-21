// The Soul IR (Prompt 41): what Afterlife knows about a dead app, typed and checked. The Vessel
// runs it, the Kiro spec is written from it, and the Oracle proves it against the old app.
// Deterministic code builds and checks it; an LLM may only propose values for it (crew.md).
import { z } from 'zod';
import { parseExpr } from './dsl';

/** A dBASE field name: up to 10 characters, upper case. */
const FieldName = z.string().regex(/^[A-Z_][A-Z0-9_]{0,9}$/);
/** An id inside the Soul: lower case, digits and dashes. */
const Id = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
/** A DOS 8.3 file name. */
const DosFile = z.string().regex(/^[A-Z0-9_-]{1,8}\.[A-Z0-9_-]{1,3}$/);
/** A key sequence in our key language ("1{Enter}PAN500{Enter}"). */
const Keys = z.string().min(1).max(500);
const Fingerprint = z.string().regex(/^fp_[0-9a-f]{16}$/);

export const FieldTypeSchema = z.enum(['C', 'N', 'D', 'L', 'M', 'F']);

export const EntityFieldSchema = z.object({
  name: FieldName,
  type: FieldTypeSchema,
  length: z.number().int().min(1).max(254),
  decimals: z.number().int().min(0).max(15),
});

export const EntitySchema = z.object({
  id: Id,
  /** Its name for people ("Medicine"). */
  name: z.string().min(1).max(80),
  /** The .DBF file it lives in. */
  file: DosFile,
  fields: z.array(EntityFieldSchema).min(1).max(255),
  /** The fields that pick one record (may be empty: some tables have no key). */
  key: z.array(FieldName),
  foreignKeys: z.array(
    z.object({
      fields: z.array(FieldName).min(1),
      references: z.object({ entity: Id, fields: z.array(FieldName).min(1) }),
    }),
  ),
  /** Fields the app numbers itself ("C0009 after C0008", "9807-0001"). */
  counters: z.array(z.object({ field: FieldName, pattern: z.string().min(1).max(40) })),
});

export const ScreenSchema = z.object({
  /** The screen's layout fingerprint (packages/screen). */
  id: Fingerprint,
  title: z.string().max(80),
  fields: z.array(
    z.object({
      label: z.string().max(80),
      row: z.number().int().min(0).max(49),
      col: z.number().int().min(0).max(79),
      width: z.number().int().min(1).max(80),
      /** The entity field it shows or edits, when known. */
      binds: z.object({ entity: Id, field: FieldName }).optional(),
    }),
  ),
  /** Keys that lead from this screen to another. */
  navigation: z.array(z.object({ keys: Keys, to: Fingerprint })),
});

/**
 * One line of a receipt layout (Prompt 61): the label the old app showed, and what it shows:
 * `entity-id.FIELD` (`bill.SUBTOTAL`, `medicine.NAME` through the line's link), or `#` for the
 * line number.
 */
const ReceiptItemSchema = z.object({
  label: z.string().max(40),
  ref: z.union([z.literal('#'), z.string().regex(/^[a-z][a-z0-9-]*\.[A-Za-z_][A-Za-z0-9_]*$/)]),
  /** What the old app showed when the field was blank (a walk-in customer: WALK-IN). */
  blank: z.string().max(40).optional(),
});

/**
 * What an action's receipt shows, in the old app's order (Prompt 61): header lines, a column per
 * line field, then the totals. From the screen the old app was on when the record was saved.
 */
export const ReceiptSchema = z.object({
  header: z.array(ReceiptItemSchema).max(20),
  columns: z.array(ReceiptItemSchema).max(20),
  totals: z.array(ReceiptItemSchema).max(20),
});

export const ActionSchema = z.object({
  id: Id,
  /** The screen it starts on. */
  screen: Fingerprint,
  name: z.string().min(1).max(80),
  /** The key macro, with {field} placeholders for values ("1{Enter}{code}{Enter}{qty}{Enter}"). */
  keys: Keys,
  effects: z.array(
    z.object({
      entity: Id,
      kind: z.enum(['insert', 'update', 'delete']),
      fields: z.array(FieldName),
    }),
  ),
  /** The receipt it gives (Prompt 61); none for an action that prints nothing. */
  receipt: ReceiptSchema.optional(),
});

export const RuleSchema = z.object({
  id: Id,
  /**
   * compute: a value the app works out (target is set). validate: true when the input is
   * accepted. effect: what an action changes. counter: how a number is given out.
   */
  kind: z.enum(['compute', 'validate', 'effect', 'counter']),
  /** For compute, effect and counter: the field it gives a value to ("bill.discount"). */
  target: z
    .string()
    .regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/)
    .optional(),
  en: z.string().min(1).max(500),
  ur: z.string().max(500),
  /** The rule in the Soul's expression language (Prompt 42). */
  expression: z.string().min(1).max(2000),
  /** The observations that show it (ids from the observations table). */
  evidence: z.array(z.string().min(1).max(64)),
  confidence: z.number().min(0).max(1),
});

export const ProvenanceSchema = z.object({
  createdAt: z.iso.datetime(),
  /** Who made this version. `reference`: written by our team from a sample app's source. */
  createdBy: z.enum(['archaeologist', 'owner', 'voice-change', 'reference']),
  projectId: z.uuid().optional(),
  sessionIds: z.array(z.uuid()).optional(),
  observationCount: z.number().int().nonnegative(),
  /** The version this one was made from. */
  parentVersion: z.number().int().min(1).optional(),
  note: z.string().max(500).optional(),
});

const SoulObject = z.object({
  schemaVersion: z.literal(1),
  app: z.object({ id: z.string().min(1).max(64), name: z.string().min(1).max(80) }),
  version: z.number().int().min(1),
  provenance: ProvenanceSchema,
  entities: z.array(EntitySchema),
  screens: z.array(ScreenSchema),
  actions: z.array(ActionSchema),
  rules: z.array(RuleSchema),
});

const dupes = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);

/** The Soul, with every reference inside it checked. */
export const SoulSchema = SoulObject.superRefine((s, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });
  for (const [list, name] of [
    [s.entities.map((e) => e.id), 'entities'],
    [s.screens.map((x) => x.id), 'screens'],
    [s.actions.map((a) => a.id), 'actions'],
    [s.rules.map((r) => r.id), 'rules'],
  ] as const)
    for (const d of new Set(dupes(list))) issue([name], `Two ${name} have the id ${d}`);

  const entity = new Map(s.entities.map((e) => [e.id, e]));
  const fieldsOf = (id: string) => new Set(entity.get(id)?.fields.map((f) => f.name) ?? []);
  s.entities.forEach((e, i) => {
    const own = fieldsOf(e.id);
    for (const d of new Set(dupes(e.fields.map((f) => f.name))))
      issue(['entities', i, 'fields'], `Two fields are called ${d}`);
    for (const k of e.key)
      if (!own.has(k)) issue(['entities', i, 'key'], `${k} is not a field of ${e.id}`);
    for (const c of e.counters)
      if (!own.has(c.field))
        issue(['entities', i, 'counters'], `${c.field} is not a field of ${e.id}`);
    e.foreignKeys.forEach((fk, j) => {
      for (const f of fk.fields)
        if (!own.has(f)) issue(['entities', i, 'foreignKeys', j], `${f} is not a field of ${e.id}`);
      if (!entity.has(fk.references.entity))
        issue(['entities', i, 'foreignKeys', j], `No entity ${fk.references.entity}`);
      else
        for (const f of fk.references.fields)
          if (!fieldsOf(fk.references.entity).has(f))
            issue(
              ['entities', i, 'foreignKeys', j],
              `${f} is not a field of ${fk.references.entity}`,
            );
      if (fk.fields.length !== fk.references.fields.length)
        issue(['entities', i, 'foreignKeys', j], 'A foreign key needs as many fields on each side');
    });
  });
  const screens = new Set(s.screens.map((x) => x.id));
  s.screens.forEach((x, i) => {
    x.fields.forEach((f, j) => {
      if (f.binds && !fieldsOf(f.binds.entity).has(f.binds.field))
        issue(
          ['screens', i, 'fields', j],
          `${f.binds.entity}.${f.binds.field} is not an entity field`,
        );
    });
    x.navigation.forEach((n, j) => {
      if (!screens.has(n.to)) issue(['screens', i, 'navigation', j], `No screen ${n.to}`);
    });
  });
  s.actions.forEach((a, i) => {
    if (!screens.has(a.screen)) issue(['actions', i, 'screen'], `No screen ${a.screen}`);
    a.effects.forEach((e, j) => {
      if (!entity.has(e.entity)) issue(['actions', i, 'effects', j], `No entity ${e.entity}`);
      for (const f of e.fields)
        if (!fieldsOf(e.entity).has(f))
          issue(['actions', i, 'effects', j], `${f} is not a field of ${e.entity}`);
    });
    for (const part of ['header', 'columns', 'totals'] as const)
      a.receipt?.[part].forEach((x, j) => {
        if (x.ref === '#') return;
        const [id, field] = x.ref.split('.') as [string, string];
        if (!fieldsOf(id).has(field))
          issue(['actions', i, 'receipt', part, j], `${x.ref} is not an entity field`);
      });
  });
  s.rules.forEach((r, i) => {
    if (r.kind !== 'validate' && !r.target)
      issue(['rules', i, 'target'], `A ${r.kind} rule needs a target`);
    // The expression must be one the Vessel can run (Prompt 42).
    try {
      parseExpr(r.expression);
    } catch (e) {
      issue(['rules', i, 'expression'], (e as Error).message);
    }
  });
});

export type Soul = z.infer<typeof SoulSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type Screen = z.infer<typeof ScreenSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type ReceiptLayout = z.infer<typeof ReceiptSchema>;
export type Rule = z.infer<typeof RuleSchema>;

/** Object keys in a fixed order, so the same Soul is always the same text (diffs, hashes). */
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  return v;
}

/** The Soul as JSON text with sorted keys. Throws if it is not a valid Soul. */
export function serializeSoul(soul: Soul): string {
  return `${JSON.stringify(sortKeys(SoulSchema.parse(soul)), null, 2)}\n`;
}

export class SoulError extends Error {
  override name = 'SoulError';
}

/** Reads a Soul from JSON text. Throws SoulError, naming where and what, if it is not valid. */
export function parseSoul(text: string): Soul {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new SoulError(`Not JSON: ${(e as Error).message}`);
  }
  const r = SoulSchema.safeParse(raw);
  if (!r.success)
    throw new SoulError(
      r.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join('.') || '(soul)'}: ${i.message}`)
        .join('; '),
    );
  return r.data;
}
