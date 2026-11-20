// Rule verification and selection (Prompt 55). Each candidate rule the model proposed (Prompt 54)
// is run, deterministically, on the record of every effect it is meant to explain. Only candidates
// that give the value the old app wrote in 100% of the observations are kept, and the simplest
// (fewest AST nodes) wins. When a threshold in a candidate that fits has not been tried on both
// sides, or nothing fits, it asks the Possessor for targeted probes ("try a bill subtotal of
// exactly 5000 and 5001") and checks again. The model never decides: this code does.
import type { DbfValue } from '@afterlife/dbf';
import {
  dslDate,
  evaluate,
  parseExpr,
  recordEnv,
  type Entity,
  type Env,
  type Expr,
} from '@afterlife/soul';
import Decimal from 'decimal.js';
import { effectsOf, ruleName, type Effect, type EffectObservation } from './hypotheses';

/** What verification needs of an entity. The fields (from the Soul) type the values by DBF type. */
export type VerifyEntity = {
  id: string;
  file: string;
  key?: string[];
  counters?: { field: string }[];
  fields?: Entity['fields'];
};

/** The rule target of an effect: "bill.gst". */
export const targetOf = (e: Pick<Effect, 'entity' | 'field'>) => `${ruleName(e.entity)}.${e.field}`;

/** The number of nodes in an expression's tree: what "simplest" means. */
export function countNodes(e: Expr): number {
  switch (e.type) {
    case 'unary':
      return 1 + countNodes(e.arg);
    case 'binary':
      return 1 + countNodes(e.left) + countNodes(e.right);
    case 'if':
      return 1 + countNodes(e.cond) + countNodes(e.then) + countNodes(e.else);
    case 'call':
      return 1 + e.args.reduce((n, a) => n + countNodes(a), 0);
    case 'lambda':
      return 1 + countNodes(e.body);
    default:
      return 1;
  }
}

const text = (v: DbfValue | undefined) => (v === null || v === undefined ? '' : String(v).trim());
const upperValues = (entity: VerifyEntity | undefined, rec: Record<string, string>) => {
  const names = new Map((entity?.fields ?? []).map((f) => [f.name.toLowerCase(), f.name]));
  return Object.fromEntries(
    Object.entries(rec).map(([k, v]) => [names.get(k) ?? k.toUpperCase(), v]),
  );
};
/** A record as a rule sees it: typed by the entity's DBF fields when known, else as it looks. */
function asRecord(entity: VerifyEntity | undefined, rec: Record<string, string>): Env {
  if (!entity?.fields?.length) return { ...rec };
  const env = recordEnv(entity as Entity, upperValues(entity, rec)) as Env;
  // A field the Soul does not list (a newer file) still counts, as it looks.
  for (const [k, v] of Object.entries(rec)) if (!(k in env)) env[k] = v;
  return env;
}

/**
 * What a rule for this effect is evaluated against:
 * - its own record, without the value it is to explain (for a change, the value before it);
 * - the one record of each other table the same action wrote that belongs with it (the only one,
 *   or the one that holds this record's key, such as the bill line for the medicine whose stock
 *   went down). A table with several and no link is left out;
 * - `today`, the app's date, when known.
 */
export function envFor(
  effect: Effect,
  observation: EffectObservation,
  entities: VerifyEntity[],
  opts: { today?: string } = {},
): Env {
  const byFile = new Map(entities.map((e) => [e.file.toUpperCase(), e]));
  const own = byFile.get(effect.file.toUpperCase());
  const record = { ...effect.record };
  if (effect.kind === 'inserted') delete record[effect.field];
  else record[effect.field] = effect.before ?? '';
  const env: Env = { [ruleName(effect.entity)]: asRecord(own, record) };
  const ownKey = (own?.key ?? []).map((k) => effect.record[k.toLowerCase()]).filter(Boolean);
  for (const [file, t] of Object.entries(observation.dbfDiff.tables)) {
    if (file.toUpperCase() === effect.file.toUpperCase()) continue;
    const e = byFile.get(file.toUpperCase());
    const id = ruleName(e?.id ?? file.replace(/\.DBF$/i, '').toLowerCase());
    const rows: Record<string, string>[] = [
      ...t.inserted.map((r) =>
        Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k.toLowerCase(), text(v)])),
      ),
      ...t.updated.map((u) => ({
        ...(u.key && t.key ? { [t.key.toLowerCase()]: u.key } : {}),
        ...Object.fromEntries(u.changes.map((c) => [c.field.toLowerCase(), text(c.after)])),
      })),
    ];
    const linked =
      rows.length === 1
        ? rows
        : rows.filter((r) => ownKey.length && ownKey.every((k) => Object.values(r).includes(k!)));
    if (linked.length === 1) env[id] = asRecord(e, linked[0]!);
  }
  if (opts.today) env.today = dslDate(opts.today.slice(0, 10));
  return env;
}

const D = Decimal.clone({ precision: 40 });
type Dec = InstanceType<typeof D>;
/** A decimal from the DSL (its own Decimal clone). */
const isDecimal = (v: unknown): v is Decimal => Decimal.isDecimal(v);

/** The value a rule gives on one effect, or the reason it gives none. */
function run(ast: Expr, env: Env): { value: string | null; error?: string } {
  try {
    const v = evaluate(ast, env);
    if (isDecimal(v)) return { value: v.toString() };
    return {
      value: null,
      error: `gives ${typeof v === 'boolean' ? 'true or false' : 'no number'}`,
    };
  } catch (e) {
    return { value: null, error: (e as Error).message };
  }
}
const same = (got: string | null, expected: string) => {
  if (got === null) return false;
  try {
    return new D(got).eq(new D(expected));
  } catch {
    return false;
  }
};

export type CandidateCheck = {
  expression: string;
  /** Its AST size; null when it does not parse. */
  nodes: number | null;
  /** How many of the effects it gives the old app's value for. */
  explained: number;
  total: number;
  /** The first few effects it gets wrong: what the old app wrote, what the rule gives. */
  misses: { observation: string; expected: string; got: string | null; error?: string }[];
};

/** A value to try, so that a threshold is seen on both sides and exactly on it. */
export type RuleProbe = {
  /** The rule target it is for ("bill.discount"). */
  target: string;
  /** The field to set ("bill.subtotal"). */
  field: string;
  /** The values to try: exactly on the threshold, and just over it. */
  values: string[];
  /** For the Possessor and the owner: "Try a bill subtotal of exactly 5000 and of 5001." */
  text: string;
};

export type Verification = {
  target: string;
  /** How many effects (values the old app wrote) there are for this target, in how many observations. */
  effects: number;
  observations: number;
  checks: CandidateCheck[];
  /** The simplest candidate that explains 100% of the effects, or null when none does. */
  selected: {
    expression: string;
    nodes: number;
    /** The observations it was checked against. */
    evidence: string[];
    /** 0 to 1: from the evidence count and how much of the thresholds the observations covered. */
    confidence: number;
    /** 0 to 1: of the thresholds in the candidates that fit, how much was seen (below, on, above). */
    coverage: number;
  } | null;
  /** Other candidates that explain every effect too (they lost on simplicity, or came later). */
  alsoFit: string[];
  /** What to try next, to tell the candidates apart or to find one that fits. */
  probes: RuleProbe[];
};

/** Comparisons of a field with a number in an expression: the thresholds a rule hangs on. */
function thresholds(e: Expr): { field: string; value: string }[] {
  const out: { field: string; value: string }[] = [];
  const walk = (x: Expr) => {
    if (x.type === 'binary') {
      if (['<', '<=', '>', '>=', '=', '!='].includes(x.op)) {
        const [r, n] =
          x.left.type === 'ref' && x.right.type === 'num'
            ? [x.left, x.right]
            : x.right.type === 'ref' && x.left.type === 'num'
              ? [x.right, x.left]
              : [null, null];
        if (r && n) out.push({ field: r.path.join('.'), value: n.value });
      }
      walk(x.left);
      walk(x.right);
    } else if (x.type === 'unary') walk(x.arg);
    else if (x.type === 'if') [x.cond, x.then, x.else].forEach(walk);
    else if (x.type === 'call') x.args.forEach(walk);
    else if (x.type === 'lambda') walk(x.body);
  };
  walk(e);
  return out;
}

/** The value of `entity.field` in an env, as a decimal, when it has one. */
function fieldValue(env: Env, path: string): Dec | null {
  const [head, ...rest] = path.split('.');
  let v: unknown = env[head!];
  for (const k of rest) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : null;
  if (isDecimal(v)) return new D(v.toString());
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return new D(v);
  return null;
}

/** Below, exactly on, and above a threshold: which of the three the observations show. */
function sides(envs: Env[], t: { field: string; value: string }) {
  const c = new D(t.value);
  const seen = { below: false, on: false, above: false };
  for (const env of envs) {
    const v = fieldValue(env, t.field);
    if (!v) continue;
    if (v.lt(c)) seen.below = true;
    else if (v.eq(c)) seen.on = true;
    else seen.above = true;
  }
  return seen;
}

const probeText = (field: string, values: string[]) => {
  const [entity, name] = field.split('.');
  return `Try a ${entity!.replace(/_/g, ' ')} ${name!.replace(/_/g, ' ')} of exactly ${values[0]} and of ${values[1]}.`;
};

/**
 * Checks each candidate against every effect of `target` in the observations and picks the
 * simplest that explains all of them. Pure and deterministic: same input, same answer.
 */
export function verifyCandidates(
  target: string,
  candidates: string[],
  observations: EffectObservation[],
  entities: VerifyEntity[],
  opts: { today?: string } = {},
): Verification {
  const byId = new Map(observations.map((o) => [o.id, o]));
  const effects = effectsOf(observations, entities).filter((e) => targetOf(e) === target);
  const envs = effects.map((e) => envFor(e, byId.get(e.observation)!, entities, opts));
  const seen = new Set<string>();
  const checks: (CandidateCheck & { ast: Expr | null; order: number })[] = [];
  candidates.forEach((expression, order) => {
    const k = expression.replace(/\s+/g, '');
    if (seen.has(k)) return;
    seen.add(k);
    let ast: Expr | null = null;
    try {
      ast = parseExpr(expression);
    } catch (e) {
      checks.push({
        expression,
        ast,
        order,
        nodes: null,
        explained: 0,
        total: effects.length,
        misses: [{ observation: '', expected: '', got: null, error: (e as Error).message }],
      });
      return;
    }
    let explained = 0;
    const misses: CandidateCheck['misses'] = [];
    effects.forEach((eff, i) => {
      const r = run(ast!, envs[i]!);
      if (same(r.value, eff.after)) explained++;
      else if (misses.length < 5)
        misses.push({
          observation: eff.observation,
          expected: eff.after,
          got: r.value,
          ...(r.error ? { error: r.error } : {}),
        });
    });
    checks.push({
      expression,
      ast,
      order,
      nodes: countNodes(ast),
      explained,
      total: effects.length,
      misses,
    });
  });
  const fits = effects.length
    ? checks
        .filter((c) => c.ast && c.explained === effects.length)
        .sort((a, b) => a.nodes! - b.nodes! || a.order - b.order)
    : [];
  // The thresholds of what fits (or, when nothing does, of every candidate): tried on both sides?
  const pool = fits.length ? fits : checks.filter((c) => c.ast);
  const marks = new Map<string, { field: string; value: string }>();
  for (const c of pool) for (const t of thresholds(c.ast!)) marks.set(`${t.field} ${t.value}`, t);
  let covered = 0;
  const probes: RuleProbe[] = [];
  for (const t of marks.values()) {
    const s = sides(envs, t);
    covered += (Number(s.below) + Number(s.on) + Number(s.above)) / 3;
    if (!(s.below && s.on && s.above)) {
      const just = new D(t.value).plus(1).toString();
      const values = [t.value, just];
      probes.push({ target, field: t.field, values, text: probeText(t.field, values) });
    }
  }
  const coverage = marks.size ? covered / marks.size : 1;
  const best = fits[0];
  const evidence = [...new Set(effects.map((e) => e.observation))];
  const n = evidence.length;
  const strip = (c: (typeof checks)[number]): CandidateCheck => ({
    expression: c.expression,
    nodes: c.nodes,
    explained: c.explained,
    total: c.total,
    misses: c.misses,
  });
  return {
    target,
    effects: effects.length,
    observations: n,
    checks: checks.map(strip),
    selected: best
      ? {
          expression: best.expression,
          nodes: best.nodes!,
          evidence,
          confidence: confidenceOf(n, coverage),
          coverage: Math.round(coverage * 100) / 100,
        }
      : null,
    alsoFit: fits.slice(1).map((c) => c.expression),
    probes: best && !fits.slice(1).length && coverage === 1 ? [] : probes,
  };
}

/**
 * Confidence from the evidence and the probe coverage: n / (n + 2) for n observations (1 gives
 * 0.33, 3 gives 0.6, 10 gives 0.83), scaled from half to all of it by the threshold coverage.
 */
export function confidenceOf(observations: number, coverage: number): number {
  const evidence = observations / (observations + 2);
  return Math.round(evidence * (0.5 + 0.5 * coverage) * 100) / 100;
}

/** Runs probes in the old app and gives back what they did (the Possessor, or a recording). */
export type RuleProbeRunner = (probes: RuleProbe[]) => Promise<EffectObservation[]>;

/**
 * Verifies, and while a probe could settle it, asks for the probes and verifies again (at most
 * `maxRounds` times). Without a runner the probes it would ask for are returned, not run.
 */
export async function selectRule(
  target: string,
  candidates: string[],
  observations: EffectObservation[],
  entities: VerifyEntity[],
  opts: { today?: string; probe?: RuleProbeRunner; maxRounds?: number } = {},
): Promise<Verification & { rounds: number; probed: RuleProbe[] }> {
  let all = [...observations];
  const probed: RuleProbe[] = [];
  const max = opts.maxRounds ?? 3;
  for (let round = 0; ; round++) {
    const v = verifyCandidates(target, candidates, all, entities, opts);
    if (!opts.probe || !v.probes.length || round >= max) return { ...v, rounds: round, probed };
    const fresh = (await opts.probe(v.probes)).filter((o) => !all.some((x) => x.id === o.id));
    probed.push(...v.probes);
    if (!fresh.length) return { ...v, rounds: round + 1, probed };
    all = [...all, ...fresh];
  }
}
