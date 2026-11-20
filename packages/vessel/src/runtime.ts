// The Vessel runtime (Prompt 58): the reborn app is this code running a Soul, not code written for
// the app. `performAction` does what the old app did for an action (saving a bill): it fills each
// field of the records it writes from the Soul (a rule, a counter, the key of the record it belongs
// to, the line's position, or what the owner typed), checks the validation rules, applies the
// effect rules to the records it changes, and returns the effects as a DBF diff, the same format
// the DBF differ gives for the old app. Decimal arithmetic throughout (the DSL is decimal.js).
import {
  numericDelta,
  type DbfField,
  type DbfRecord,
  type DbfValue,
  type SnapshotDiff,
  type TableDiff,
} from '@afterlife/dbf';
import {
  DslError,
  dslDate,
  evaluate,
  nextId,
  parseExpr,
  recordEnv,
  type Action,
  type Entity,
  type Env,
  type Expr,
  type Rule,
  type Soul,
} from '@afterlife/soul';
import { ConflictError, type EntityStore } from './store';
import { ValueError, blank, parseInput, toDbfValue } from './values';

/** The Soul cannot be run as it is (an action the runtime has no way to perform). */
export class VesselError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VesselError';
  }
}

/** An entity id as a rule names it: bill-item is bill_item. */
export const ruleName = (id: string) => id.replace(/-/g, '_');
/** In a rule, the line being worked on, and all the lines of the action. */
export const LINE_NAME = 'item';
export const LINES_NAME = 'items';

export type ActionInputs = {
  /** What the owner typed for the record the action writes, by field name (CUST_ID). */
  values?: Record<string, string>;
  /** Each line (CODE, QTY), in the order typed. */
  lines?: Record<string, string>[];
};

/** Why the action was refused: the rule's own words, which line, which field. */
export type Refusal = { message: string; rule?: string; line?: number; field?: string };

export type ActionResult =
  | {
      ok: true;
      /** The effects, as the DBF differ gives them for the old app. */
      effects: SnapshotDiff;
      /** The record it wrote (the bill), as stored. */
      record: Record<string, DbfValue>;
      lines: Record<string, DbfValue>[];
    }
  | { ok: false; refused: Refusal[] };

type Values = Record<string, DbfValue>;

/** The names an expression uses ("bill.subtotal" is ["bill", "subtotal"]), lambda parameters left out. */
function refs(e: Expr, bound: Set<string> = new Set()): string[][] {
  switch (e.type) {
    case 'ref':
      return bound.has(e.path[0]!) ? [] : [e.path];
    case 'unary':
      return refs(e.arg, bound);
    case 'binary':
      return [...refs(e.left, bound), ...refs(e.right, bound)];
    case 'if':
      return [...refs(e.cond, bound), ...refs(e.then, bound), ...refs(e.else, bound)];
    case 'call':
      return e.args.flatMap((a) => refs(a, bound));
    case 'lambda':
      return refs(e.body, new Set([...bound, e.param]));
    default:
      return [];
  }
}

type Link = { field: string; entity: Entity; refField: string };

/** How an action is performed: worked out once from the Soul. */
type Plan = {
  action: Action;
  header: Entity;
  headerFields: string[];
  line: Entity | null;
  lineFields: string[];
  /** Records the header and each line point at (the customer; the medicine), by name in rules. */
  headerLinks: Link[];
  lineLinks: Link[];
  /** The line's fields that copy the header's key (BILL_NO). */
  lineParent: { field: string; headerField: string }[];
  /** The line's position in its record (LINE: 1, 2, 3), from a key made of the header and it. */
  position: string | null;
  /** Fields worked out by a rule or a counter, in an order where each one's inputs come first. */
  order: { scope: 'header' | 'line'; field: string; rule?: Rule; counter?: string }[];
  validations: { rule: Rule; ast: Expr; perLine: boolean }[];
  effects: { rule: Rule; ast: Expr; entity: Entity; field: string; perLine: boolean }[];
};

function fieldOf(entity: Entity, lower: string): DbfField | undefined {
  return entity.fields.find((f) => f.name.toLowerCase() === lower);
}

function plan(soul: Soul, action: Action): Plan {
  const byId = new Map(soul.entities.map((e) => [e.id, e]));
  const ent = (id: string) => {
    const e = byId.get(id);
    if (!e)
      throw new VesselError(
        `The action ${action.id} writes ${id}, which the Soul does not describe`,
      );
    return e;
  };
  const inserts = action.effects.filter((e) => e.kind === 'insert');
  const refersTo = (from: Entity, to: Entity) =>
    from.foreignKeys.some((fk) => fk.references.entity === to.id);
  const header = inserts.find(
    (x) => !inserts.some((o) => o !== x && refersTo(ent(x.entity), ent(o.entity))),
  );
  if (!header) throw new VesselError(`The action ${action.id} writes no record of its own`);
  const H = ent(header.entity);
  const lineEffects = inserts.filter((x) => x !== header);
  if (lineEffects.length > 1 || lineEffects.some((x) => !refersTo(ent(x.entity), H)))
    throw new VesselError(`The action ${action.id} writes records the runtime cannot link up`);
  const L = lineEffects[0] ? ent(lineEffects[0].entity) : null;

  const links = (e: Entity, skip: Entity | null): Link[] =>
    e.foreignKeys
      .filter((fk) => fk.references.entity !== skip?.id && fk.fields.length === 1)
      .map((fk) => ({
        field: fk.fields[0]!,
        entity: ent(fk.references.entity),
        refField: fk.references.fields[0]!,
      }));
  const lineParent = L
    ? L.foreignKeys
        .filter((fk) => fk.references.entity === H.id)
        .flatMap((fk) =>
          fk.fields.map((f, i) => ({ field: f, headerField: fk.references.fields[i]! })),
        )
    : [];
  const parentFields = new Set(lineParent.map((p) => p.field));
  const rest = L ? L.key.filter((k) => !parentFields.has(k)) : [];
  const posField =
    rest.length === 1 && parentFields.size ? L!.fields.find((f) => f.name === rest[0]) : undefined;
  const position =
    posField && posField.type === 'N' && posField.decimals === 0 ? posField.name : null;

  const hName = ruleName(H.id);
  const lNames = L ? new Set([ruleName(L.id), LINE_NAME]) : new Set<string>();
  const lineLinks = L ? links(L, H) : [];
  const lineLookupNames = new Set(lineLinks.map((l) => ruleName(l.entity.id)));
  const parsed = soul.rules.map((rule) => {
    try {
      return { rule, ast: parseExpr(rule.expression) };
    } catch (e) {
      throw new VesselError(
        `The rule ${rule.id} is not a valid expression: ${(e as Error).message}`,
      );
    }
  });
  const usesLine = (ast: Expr) =>
    refs(ast).some((p) => lNames.has(p[0]!) || lineLookupNames.has(p[0]!));

  // Who gives each field its value.
  const computed = new Map<
    string,
    { scope: 'header' | 'line'; field: string; rule?: Rule; counter?: string; deps: string[] }
  >();
  const slot = (scope: 'header' | 'line', field: string) => `${scope}:${field}`;
  const depsOf = (ast: Expr): string[] =>
    refs(ast).flatMap((p) => {
      const [head, f] = p;
      if (head === hName && f) {
        const x = fieldOf(H, f);
        return x ? [slot('header', x.name)] : [];
      }
      if (L && lNames.has(head!) && f) {
        const x = fieldOf(L, f);
        return x ? [slot('line', x.name)] : [];
      }
      if (L && head === LINES_NAME) return L.fields.map((x) => slot('line', x.name));
      return [];
    });
  const validations: Plan['validations'] = [];
  const effects: Plan['effects'] = [];
  const updates = action.effects.filter((e) => e.kind === 'update').map((e) => ent(e.entity));
  for (const { rule, ast } of parsed) {
    if (rule.kind === 'validate') {
      validations.push({ rule, ast, perLine: usesLine(ast) });
      continue;
    }
    if (!rule.target) continue;
    const [entityName, fieldName] = rule.target.split('.') as [string, string];
    if (entityName === hName && fieldOf(H, fieldName)) {
      const f = fieldOf(H, fieldName)!.name;
      computed.set(slot('header', f), { scope: 'header', field: f, rule, deps: depsOf(ast) });
    } else if (L && lNames.has(entityName) && fieldOf(L, fieldName)) {
      const f = fieldOf(L, fieldName)!.name;
      computed.set(slot('line', f), { scope: 'line', field: f, rule, deps: depsOf(ast) });
    } else {
      const u = updates.find((x) => ruleName(x.id) === entityName);
      const f = u && fieldOf(u, fieldName);
      if (u && f) effects.push({ rule, ast, entity: u, field: f.name, perLine: usesLine(ast) });
    }
  }
  for (const c of H.counters) {
    const dateField = H.fields.find((f) => f.type === 'D');
    computed.set(slot('header', c.field), {
      scope: 'header',
      field: c.field,
      counter: c.pattern,
      deps: c.pattern.startsWith('YYMM') && dateField ? [slot('header', dateField.name)] : [],
    });
  }
  for (const p of lineParent)
    computed.set(slot('line', p.field), {
      scope: 'line',
      field: p.field,
      deps: [slot('header', p.headerField)],
    });
  for (const u of updates)
    if (!effects.some((x) => x.entity === u))
      throw new VesselError(`The action ${action.id} changes ${u.id}, but no rule says how`);

  // Each value after the values it needs (Kahn's algorithm); a cycle is a Soul the runtime cannot run.
  const order: Plan['order'] = [];
  const done = new Set<string>();
  const pending = new Map(computed);
  while (pending.size) {
    const ready = [...pending].filter(([, c]) =>
      c.deps.every((d) => d === slot(c.scope, c.field) || done.has(d) || !computed.has(d)),
    );
    if (!ready.length)
      throw new VesselError(
        `The rules of ${action.id} depend on each other in a circle: ${[...pending.keys()].join(', ')}`,
      );
    for (const [k, c] of ready) {
      order.push({
        scope: c.scope,
        field: c.field,
        ...(c.rule ? { rule: c.rule } : {}),
        ...(c.counter ? { counter: c.counter } : {}),
      });
      done.add(k);
      pending.delete(k);
    }
  }
  return {
    action,
    header: H,
    headerFields: header.fields,
    line: L,
    lineFields: lineEffects[0]?.fields ?? [],
    headerLinks: links(H, null),
    lineLinks,
    lineParent,
    position,
    order,
    validations,
    effects,
  };
}

/** What an action asks the owner for: the fields nothing in the Soul fills (Prompt 59 builds its form). */
export type ActionForm = {
  action: Action;
  header: { entity: Entity; inputs: DbfField[]; computed: DbfField[] };
  line: { entity: Entity; inputs: DbfField[]; computed: DbfField[] } | null;
};

export function actionForm(soul: Soul, actionId: string): ActionForm {
  const action = soul.actions.find((a) => a.id === actionId);
  if (!action) throw new VesselError(`The Soul has no action ${actionId}`);
  const p = plan(soul, action);
  const filled = new Set(p.order.map((o) => `${o.scope}:${o.field}`));
  if (p.position) filled.add(`line:${p.position}`);
  const split = (e: Entity, scope: 'header' | 'line', fields: string[]) => ({
    entity: e,
    inputs: e.fields.filter((f) => fields.includes(f.name) && !filled.has(`${scope}:${f.name}`)),
    computed: e.fields.filter((f) => filled.has(`${scope}:${f.name}`)),
  });
  return {
    action,
    header: split(p.header, 'header', p.headerFields),
    line: p.line ? split(p.line, 'line', p.lineFields) : null,
  };
}

const keyOf = (e: Entity) => (e.key.length === 1 ? e.key[0]! : null);
const text = (v: DbfValue | undefined) => (v === null || v === undefined ? '' : String(v));

export type VesselOptions = {
  /** The app's date (YYYY-MM-DD or YYYYMMDD): the old PC's clock. Asked once per action. */
  today: () => string;
};

export type Vessel = {
  soul: Soul;
  store: EntityStore;
  actions: Action[];
  performAction(actionId: string, inputs?: ActionInputs): Promise<ActionResult>;
};

export function createVessel(soul: Soul, store: EntityStore, opts: VesselOptions): Vessel {
  const plans = new Map<string, Plan>();
  const planFor = (id: string) => {
    const action = soul.actions.find((a) => a.id === id);
    if (!action) throw new VesselError(`The Soul has no action ${id}`);
    if (!plans.has(id)) plans.set(id, plan(soul, action));
    return plans.get(id)!;
  };

  async function performAction(actionId: string, inputs: ActionInputs = {}): Promise<ActionResult> {
    const p = planFor(actionId);
    const H = p.header;
    const L = p.line;
    const refused: Refusal[] = [];
    const today = dslDate(opts.today().slice(0, 10));
    const now = { year: Number(today.iso.slice(0, 4)), month: Number(today.iso.slice(5, 7)) };

    // What is stored now, for every file the action reads or writes.
    const files = new Set([
      H.file,
      ...(L ? [L.file] : []),
      ...p.headerLinks.map((l) => l.entity.file),
      ...p.lineLinks.map((l) => l.entity.file),
      ...p.effects.map((x) => x.entity.file),
    ]);
    const stored: Record<string, DbfRecord[]> = {};
    for (const f of files) stored[f] = await store.records(f);
    const find = (e: Entity, field: string, value: string) =>
      stored[e.file]!.findIndex((r) => !r.deleted && text(r.values[field]) === value);

    // What was typed: only into fields nothing else fills.
    const filled = new Set(p.order.map((o) => `${o.scope}:${o.field}`));
    if (p.position) filled.add(`line:${p.position}`);
    const typed = (
      e: Entity,
      scope: 'header' | 'line',
      allowed: string[],
      raw: Record<string, string>,
      line?: number,
    ) => {
      const out: Values = Object.fromEntries(e.fields.map((f) => [f.name, blank(f)]));
      for (const [name, value] of Object.entries(raw)) {
        const f = e.fields.find((x) => x.name === name.toUpperCase());
        if (!f || !allowed.includes(f.name)) {
          refused.push({
            message: `${name} is not something this action asks for`,
            field: name,
            ...(line ? { line } : {}),
          });
          continue;
        }
        if (filled.has(`${scope}:${f.name}`)) {
          refused.push({
            message: `${f.name} is worked out by the app, not typed`,
            field: f.name,
            ...(line ? { line } : {}),
          });
          continue;
        }
        try {
          out[f.name] = parseInput(f, value);
        } catch (err) {
          if (!(err instanceof ValueError)) throw err;
          refused.push({ message: err.message, field: f.name, ...(line ? { line } : {}) });
        }
      }
      return out;
    };
    const header = typed(H, 'header', p.headerFields, inputs.values ?? {});
    const lines = L
      ? (inputs.lines ?? []).map((raw, i) => typed(L, 'line', p.lineFields, raw, i + 1))
      : [];
    if (L && !lines.length)
      refused.push({ message: `${H.name} needs at least one ${L.name.toLowerCase()}` });
    if (p.position) {
      const pf = L!.fields.find((f) => f.name === p.position)!;
      lines.forEach((l, i) => (l[p.position!] = toDbfValue(pf, String(i + 1))));
    }
    if (refused.length) return { ok: false, refused };

    // The records they point at: a code that is not there is refused (blank is allowed: walk-in).
    const lookup = (links: Link[], values: Values, line?: number) => {
      const env: Env = {};
      for (const l of links) {
        const v = text(values[l.field]);
        if (v === '') continue;
        const at = find(l.entity, l.refField, v);
        if (at < 0) {
          refused.push({
            message: `There is no ${l.entity.name.toLowerCase()} with ${l.refField} ${v}`,
            field: l.field,
            ...(line ? { line } : {}),
          });
          continue;
        }
        env[ruleName(l.entity.id)] = recordEnv(l.entity, stored[l.entity.file]![at]!.values);
      }
      return env;
    };
    const headerLookups = lookup(p.headerLinks, header);
    const lineLookups = lines.map((l, i) => lookup(p.lineLinks, l, i + 1));
    if (refused.length) return { ok: false, refused };

    const hName = ruleName(H.id);
    const envFor = (line?: number): Env => {
      const lineEnvs = L ? lines.map((l) => recordEnv(L, l)) : [];
      const env: Env = { ...headerLookups, [hName]: recordEnv(H, header), today };
      if (L) env[LINES_NAME] = lineEnvs;
      if (L && line !== undefined) {
        Object.assign(env, lineLookups[line]);
        env[LINE_NAME] = lineEnvs[line];
        env[ruleName(L.id)] = lineEnvs[line];
      }
      return env;
    };
    const run = (rule: Rule, ast: Expr, env: Env, line?: number): unknown => {
      try {
        return evaluate(ast, env);
      } catch (err) {
        if (!(err instanceof DslError)) throw err;
        refused.push({
          message: `${rule.en} (${err.message})`,
          rule: rule.id,
          ...(line !== undefined ? { line: line + 1 } : {}),
        });
        return undefined;
      }
    };
    const fieldNamed = (e: Entity, name: string) => e.fields.find((f) => f.name === name)!;

    // The values the app works out, each after the ones it needs.
    for (const o of p.order) {
      const e = o.scope === 'header' ? H : L!;
      const f = fieldNamed(e, o.field);
      const targets = o.scope === 'header' ? [undefined] : lines.map((_, i) => i);
      for (const i of targets) {
        const values = i === undefined ? header : lines[i]!;
        if (o.counter) {
          const ids = stored[H.file]!.filter((r) => !r.deleted).map((r) => text(r.values[o.field]));
          const dateField = H.fields.find((x) => x.type === 'D');
          const d = dateField ? text(header[dateField.name]) : '';
          const id = nextId(
            o.counter,
            ids,
            d.length === 8 ? { year: Number(d.slice(0, 4)), month: Number(d.slice(4, 6)) } : now,
          );
          if (id === null) {
            refused.push({
              message: `${H.name} has run out of numbers for ${o.field} (${o.counter})`,
              field: o.field,
            });
            continue;
          }
          values[o.field] = toDbfValue(f, id);
        } else if (o.rule) {
          const v = run(o.rule, parseExpr(o.rule.expression), envFor(i), i);
          if (v === undefined) continue;
          try {
            values[o.field] = toDbfValue(f, v);
          } catch (err) {
            if (!(err instanceof ValueError)) throw err;
            refused.push({
              message: `${o.rule.en} (${err.message})`,
              rule: o.rule.id,
              field: o.field,
            });
          }
        } else {
          const parent = p.lineParent.find((x) => x.field === o.field)!;
          values[o.field] = header[parent.headerField] ?? blank(f);
        }
      }
    }
    if (refused.length) return { ok: false, refused };

    // The validation rules: each must be true (for every line, when it is about a line).
    for (const v of p.validations) {
      const targets = v.perLine ? lines.map((_, i) => i) : [undefined];
      for (const i of targets) {
        const ok = run(v.rule, v.ast, envFor(i), i);
        if (ok === undefined) continue;
        if (ok !== true)
          refused.push({
            message: v.rule.en,
            rule: v.rule.id,
            ...(i !== undefined ? { line: i + 1 } : {}),
          });
      }
    }
    if (refused.length) return { ok: false, refused };

    // The records it changes (the stock of each medicine), one line after another.
    const changed = new Map<
      string,
      { entity: Entity; recno: number; before: Values; after: Values }
    >();
    const linkTo = (entity: Entity, values: Values, links: Link[]) => {
      const l = links.find((x) => x.entity.id === entity.id);
      if (!l) return -1;
      return find(entity, l.refField, text(values[l.field]));
    };
    for (const x of p.effects) {
      const targets = x.perLine ? lines.map((_, i) => i) : [undefined];
      for (const i of targets) {
        const recno =
          i === undefined
            ? linkTo(x.entity, header, p.headerLinks)
            : linkTo(x.entity, lines[i]!, p.lineLinks);
        if (recno < 0) continue;
        const k = `${x.entity.file}#${recno}`;
        const c = changed.get(k) ?? {
          entity: x.entity,
          recno,
          before: { ...stored[x.entity.file]![recno]!.values },
          after: { ...stored[x.entity.file]![recno]!.values },
        };
        changed.set(k, c);
        const env = envFor(i);
        env[ruleName(x.entity.id)] = recordEnv(x.entity, c.after);
        const v = run(x.rule, x.ast, env, i);
        if (v === undefined) continue;
        try {
          c.after[x.field] = toDbfValue(fieldNamed(x.entity, x.field), v);
        } catch (err) {
          if (!(err instanceof ValueError)) throw err;
          refused.push({
            message: `${x.rule.en} (${err.message})`,
            rule: x.rule.id,
            field: x.field,
          });
        }
      }
    }
    if (refused.length) return { ok: false, refused };

    // The effects, in the DBF differ's format: record numbers from 0, appended at the end.
    const tables: Record<string, TableDiff> = {};
    const table = (e: Entity): TableDiff =>
      (tables[e.file] ??= {
        key: keyOf(e),
        inserted: [],
        deleted: [],
        updated: [],
        schema: { added: [], removed: [] },
      });
    const keyValue = (e: Entity, v: Values) => (keyOf(e) ? text(v[keyOf(e)!]) : null);
    table(H).inserted.push({
      key: keyValue(H, header),
      recno: stored[H.file]!.length,
      values: header,
    });
    if (L) {
      const start = stored[L.file]!.length + (L.file === H.file ? 1 : 0);
      lines.forEach((l, i) =>
        table(L).inserted.push({ key: keyValue(L, l), recno: start + i, values: l }),
      );
    }
    for (const c of changed.values()) {
      const changes = c.entity.fields
        .filter((f) => (c.before[f.name] ?? null) !== (c.after[f.name] ?? null))
        .map((f) => ({
          field: f.name,
          before: c.before[f.name] ?? null,
          after: c.after[f.name] ?? null,
          ...(f.type === 'N' || f.type === 'F'
            ? { delta: numericDelta(c.before[f.name] ?? null, c.after[f.name] ?? null, f.decimals) }
            : {}),
        }));
      if (changes.length)
        table(c.entity).updated.push({
          key: keyValue(c.entity, c.after),
          beforeRecno: c.recno,
          afterRecno: c.recno,
          changes,
        });
    }
    for (const t of Object.values(tables)) t.updated.sort((a, b) => a.beforeRecno - b.beforeRecno);
    const effects: SnapshotDiff = {
      tables: Object.fromEntries(
        Object.entries(tables).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ),
      unchanged: [],
      addedTables: [],
      removedTables: [],
    };
    await store.commit(effects);
    return { ok: true, effects, record: header, lines };
  }

  return { soul, store, actions: soul.actions, performAction };
}

export { ConflictError };
