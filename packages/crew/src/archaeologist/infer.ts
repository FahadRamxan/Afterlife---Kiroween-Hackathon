// The Archaeologist's rules (Prompts 54 and 55, and the review of 51-60): for each value the old
// app wrote, the candidates come from the model (when one is set up) and from the enumerator; the
// deterministic check keeps those that explain every observation; and the rules are chosen in
// layers, so a value's rule only uses values whose rules are already chosen (no circles: GST is
// not "total - subtotal + discount" while total is "subtotal - discount + GST"). Probes the
// verifier asks for, and exploration probes for a value that never left 0, are run in the old app
// between rounds. Used by the worker's archaeology step and by `pnpm score:archaeology`.
import { parseExpr, type Entity, type Expr, type Rule } from '@afterlife/soul';
import type { CrewLlm } from '../llm/runtime';
import { LlmSchemaError } from '../llm/runtime';
import { enumerateCandidates } from './enumerate';
import {
  effectsOf,
  hypothesesFor,
  ruleName,
  type Effect,
  type EffectObservation,
} from './hypotheses';
import {
  targetOf,
  verifyCandidates,
  type RuleProbe,
  type Verification,
  type VerifyOptions,
} from './verify';

/** At most this many values get rules per run: each costs one model call. */
export const MAX_RULE_TARGETS = 16;
/** The round values an exploration probe tries for a total that a value may hang on. */
export const EXPLORE_VALUES = ['1000', '5000', '10000'];

/** Runs probes in the old app, with the rules found so far; gives the new observations. */
export type ProbeRun = (probes: RuleProbe[], rules: Rule[]) => Promise<EffectObservation[]>;

export type InferOptions = VerifyOptions & {
  maxTargets?: number;
  signal?: AbortSignal;
  /** Runs probes in the old app; without it the probes are returned, not run. */
  probe?: ProbeRun;
  /** Rounds of probes at most (default 3). */
  maxRounds?: number;
  log?: (message: string, level?: 'info' | 'warn') => Promise<void> | void;
  /** Called for each rule kept, with its verification (the worker emits `rule_found`). */
  found?: (rule: Rule, v: Verification & { candidates: number }) => Promise<void> | void;
};

export type Inferred = {
  rules: Rule[];
  /** Probes still asked for at the end (not run, or not settled). */
  probes: RuleProbe[];
  /** Probes run in the old app. */
  probed: RuleProbe[];
  /** The observations the probes added. */
  added: EffectObservation[];
  /** How many values were looked at. */
  targets: number;
  /** Values no candidate explained. */
  unexplained: string[];
};

/** `entity.field` names an expression uses, with `x.f` inside sum(items, x => ...) as `items.f`. */
function refsOf(e: Expr, lambda: string | null = null): string[] {
  switch (e.type) {
    case 'ref':
      if (lambda && e.path[0] === lambda) return e.path[1] ? [`items.${e.path[1]}`] : [];
      return e.path.length >= 2 ? [`${e.path[0]}.${e.path[1]}`] : [];
    case 'unary':
      return refsOf(e.arg, lambda);
    case 'binary':
      return [...refsOf(e.left, lambda), ...refsOf(e.right, lambda)];
    case 'if':
      return [...refsOf(e.cond, lambda), ...refsOf(e.then, lambda), ...refsOf(e.else, lambda)];
    case 'call':
      return e.args.flatMap((a) => refsOf(a, lambda));
    case 'lambda':
      return refsOf(e.body, e.param);
    default:
      return [];
  }
}

/**
 * One rule per value from those that fit, simplest first, in layers: a rule may use another
 * worked-out value of the same action only once that value has its rule. A value whose fitting
 * rules all need a value that never gets one is left without.
 */
export function chooseInLayers(
  fits: Map<string, string[]>,
  entities: Entity[],
  changed: Set<string>,
): Map<string, string> {
  const targets = new Set(fits.keys());
  // Values left without a rule (they only fit through each other): from then on, inputs.
  const dropped = new Set<string>();
  const counts = (t: string) => targets.has(t) && !dropped.has(t);
  const linesOf = (entity: string) =>
    entities
      .filter((e) => e.foreignKeys.some((fk) => ruleName(fk.references.entity) === entity))
      .map((e) => ruleName(e.id));
  const needs = (target: string, expression: string): string[] => {
    const [own, field] = target.split('.');
    let ast: Expr;
    try {
      ast = parseExpr(expression);
    } catch {
      return ['(not a rule)'];
    }
    return [
      ...new Set(
        refsOf(ast).flatMap((r) => {
          const [head, f] = r.split('.');
          // A change uses the value before it: not itself.
          if (head === own && f === field && changed.has(target)) return [];
          if (head === 'items')
            return linesOf(own!)
              .map((l) => `${l}.${f}`)
              .filter(counts);
          return counts(r) && r !== target ? [r] : [];
        }),
      ),
    ];
  };
  // Ranked by size plus a cost for each number taken from the data (12.5, 1.17): a rule made of
  // the record's own fields (the sum of the lines) beats one that fits by a coincidence.
  const ranked = new Map(
    [...fits].map(([t, xs]) => [
      t,
      xs.map((x, i) => ({ x, cost: costOf(x), i })).sort((p, q) => p.cost - q.cost || p.i - q.i),
    ]),
  );
  // In rounds. A value takes its best-ranked rule once every value that rule needs is settled.
  // When none can, the value that loses least by taking its best rule that can be used now
  // does so, and the rounds go on.
  const layer = (chosen: Map<string, string>) => {
    for (;;) {
      const open = [...ranked].filter(([t]) => !chosen.has(t) && !dropped.has(t));
      const ready = (t: string, x: string) => needs(t, x).every((n) => chosen.has(n));
      const round = open.filter(([t, xs]) => ready(t, xs[0]!.x));
      if (round.length) {
        for (const [t, xs] of round) chosen.set(t, xs[0]!.x);
        continue;
      }
      let settle: { t: string; x: string; loss: number } | null = null;
      for (const [t, xs] of open) {
        const ok = xs.find((y) => ready(t, y.x));
        if (!ok) continue;
        const loss = ok.cost - xs[0]!.cost;
        if (!settle || loss < settle.loss) settle = { t, x: ok.x, loss };
      }
      if (!settle) return chosen;
      chosen.set(settle.t, settle.x);
    }
  };
  const chosen = layer(new Map());
  // Stuck: values that only fit through each other (subtotal = total - GST + discount, with no
  // lines to sum). Leave out the one whose loss lets the most others have a rule, and go on.
  for (;;) {
    const stuck = [...fits.keys()].filter((t) => !chosen.has(t) && !dropped.has(t)).sort();
    if (!stuck.length) break;
    let best: { t: string; n: number } | null = null;
    for (const t of stuck) {
      dropped.add(t);
      const n = layer(new Map(chosen)).size;
      dropped.delete(t);
      if (!best || n > best.n) best = { t, n };
    }
    dropped.add(best!.t);
    layer(chosen);
  }
  return chosen;
}

/** Size, plus 3 for each number in it other than 0, 1 and 2 (the places of trunc(x, 2)). */
export function costOf(expression: string): number {
  let ast: Expr;
  try {
    ast = parseExpr(expression);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
  let cost = 0;
  const walk = (e: Expr): void => {
    cost++;
    if (e.type === 'num' && !['0', '1', '2'].includes(e.value)) cost += 3;
    if (e.type === 'unary') walk(e.arg);
    else if (e.type === 'binary') [e.left, e.right].forEach(walk);
    else if (e.type === 'if') [e.cond, e.then, e.else].forEach(walk);
    else if (e.type === 'call') e.args.forEach(walk);
    else if (e.type === 'lambda') walk(e.body);
  };
  walk(ast);
  return cost;
}

const isConstant = (expression: string) => {
  try {
    return parseExpr(expression).type === 'num';
  } catch {
    return false;
  }
};

export async function inferRules(
  llm: CrewLlm | null,
  entities: Entity[],
  observations: EffectObservation[],
  opts: InferOptions = {},
): Promise<Inferred> {
  const log = opts.log ?? (() => undefined);
  const verify: VerifyOptions = {
    ...(opts.today ? { today: opts.today } : {}),
    ...(opts.tables ? { tables: opts.tables } : {}),
  };
  const fromModel = new Map<string, { expression: string; why: string }[]>();
  const unexplained: string[] = [];
  const probed: RuleProbe[] = [];
  const added: EffectObservation[] = [];
  let obs = [...observations];
  const maxRounds = opts.maxRounds ?? 3;
  for (let round = 0; ; round++) {
    if (opts.signal?.aborted) throw opts.signal.reason;
    const byTarget = new Map<string, Effect[]>();
    for (const e of effectsOf(obs, entities)) {
      const list = byTarget.get(targetOf(e)) ?? [];
      list.push(e);
      byTarget.set(targetOf(e), list);
    }
    // By name, in code-point order: stored observations (JSONB) do not keep a record's field
    // order, and a locale's order differs from machine to machine.
    const max = opts.maxTargets ?? MAX_RULE_TARGETS;
    const targets = [...byTarget].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)).slice(0, max);
    if (round === 0 && byTarget.size > targets.length)
      await log(
        `${byTarget.size} values were written; rules for the first ${targets.length}`,
        'warn',
      );
    const verifications = new Map<string, Verification & { candidates: number }>();
    const fits = new Map<string, string[]>();
    const changed = new Set<string>();
    for (const [target, effects] of targets) {
      if (opts.signal?.aborted) throw opts.signal.reason;
      if (effects[0]!.kind === 'changed') changed.add(target);
      if (llm && !fromModel.has(target)) {
        // The model sees a value that is not zero when there is one: a 0.00 discount says little.
        const shown = effects.find((e) => !/^-?0+(\.0+)?$/.test(e.after)) ?? effects[0]!;
        try {
          fromModel.set(target, (await hypothesesFor(shown, obs, llm, entities)).candidates);
        } catch (e) {
          if (!(e instanceof LlmSchemaError)) throw e;
          await log(`${target}: the model gave no usable candidates (${e.message})`, 'warn');
          fromModel.set(target, []);
        }
      }
      const candidates = [
        ...new Set([
          ...(fromModel.get(target) ?? []).map((c) => c.expression),
          ...enumerateCandidates(effects, obs, entities, verify),
        ]),
      ];
      const v = verifyCandidates(target, candidates, obs, entities, verify);
      verifications.set(target, { ...v, candidates: candidates.length });
      // One observation that several rules fit tells them apart by size only (a fee plus a late
      // fee, or the fee less a discount of 0 plus it): no rule yet, until another observation.
      if (v.selected && (!v.alsoFit.length || v.selected.evidence.length >= 2))
        fits.set(target, [v.selected.expression, ...v.alsoFit]);
    }
    const chosen = chooseInLayers(fits, entities, changed);
    const rules: Rule[] = [...chosen].map(([target, expression]) => {
      const v = verifications.get(target)!;
      const why = fromModel
        .get(target)
        ?.find((c) => c.expression === expression)
        ?.why.trim();
      return {
        id: target.replace(/[._]/g, '-').slice(0, 48),
        kind: changed.has(target) ? 'effect' : 'compute',
        target,
        en: (why || `The ${target.replace(/[._]/g, ' ')} is ${expression}.`).slice(0, 500),
        ur: '',
        expression,
        evidence: v.selected!.evidence,
        confidence: v.selected!.confidence,
      };
    });
    // What to try next: the verifier's probes, and for a value that never left 0 (a discount on
    // small bills), bills with a bigger total, which it may depend on.
    const probes = [...verifications.values()].flatMap((v) => v.probes);
    // A value never seen to change: a constant rule, or one with too few observations for any
    // rule, whose every value was the same.
    const constant = new Map<string, string>();
    for (const r of rules) if (isConstant(r.expression)) constant.set(r.target!, r.expression);
    for (const [target, effects] of targets)
      if (
        !chosen.has(target) &&
        effects.every(
          (e) => /^-?\d+(\.\d+)?$/.test(e.after) && Number(e.after) === Number(effects[0]!.after),
        )
      )
        constant.set(target, String(Number(effects[0]!.after)));
    for (const [target, was] of constant) {
      const [entity] = target.split('.');
      // A total over the lines (kept or not yet: one bill fits two ways of summing them).
      const total = [...verifications.values()].find(
        (v) =>
          v.target.startsWith(`${entity}.`) &&
          [v.selected?.expression ?? '', ...v.alsoFit].some((x) => x.startsWith('sum(items')),
      );
      if (!total) continue;
      const seen = (byTarget.get(total.target) ?? []).map((e) => Number(e.after));
      const values = EXPLORE_VALUES.filter((x) => !seen.some((s) => s >= Number(x)));
      if (values.length)
        probes.push({
          target,
          field: total.target,
          values,
          text: `Try a ${total.target.replace(/[._]/g, ' ')} of ${values.join(', ')}: ${target} was always ${was}.`,
        });
    }
    // Each value of a field is asked for once: a probe the old app was already given (or that no
    // bill could make) is not typed again, nor a value of 0 or less, which no bill has.
    const before = new Set(probed.flatMap((p) => p.values.map((v) => `${p.field}=${v}`)));
    const asked: RuleProbe[] = [];
    for (const p of probes) {
      const values = p.values.filter(
        (v) =>
          Number(v) > 0 &&
          !before.has(`${p.field}=${v}`) &&
          !asked.some((q) => q.field === p.field && q.values.includes(v)),
      );
      if (values.length)
        asked.push(
          values.length === p.values.length
            ? p
            : {
                ...p,
                values,
                text: `Try a ${p.field.replace(/[._]/g, ' ')} of ${values.join(' and of ')}.`,
              },
        );
    }
    const done = !opts.probe || !asked.length || round >= maxRounds;
    let fresh: EffectObservation[] = [];
    if (!done) {
      await log(`Probing the old app: ${asked.map((p) => p.text).join(' ')}`);
      fresh = (await opts.probe!(asked, rules)).filter((o) => !obs.some((x) => x.id === o.id));
      probed.push(...asked);
      added.push(...fresh);
      obs = [...obs, ...fresh];
    }
    if (done || !fresh.length) {
      for (const [target] of targets) if (!chosen.has(target)) unexplained.push(target);
      for (const r of rules) {
        const v = verifications.get(r.target!)!;
        await opts.found?.(r, v);
        await log(
          `${r.target} = ${r.expression}: explains all ${v.effects} values in ${r.evidence.length} observations (confidence ${Math.round(r.confidence * 100)}%)`,
        );
      }
      for (const t of unexplained) {
        const v = verifications.get(t)!;
        await log(
          v.selected
            ? `${t}: ${v.alsoFit.length + 1} rules fit its one observation, so none is kept yet`
            : `${t}: no rule explains all ${v.effects} values (of ${v.candidates} candidates)`,
          'warn',
        );
      }
      return { rules, probes: asked, probed, added, targets: targets.length, unexplained };
    }
  }
}
